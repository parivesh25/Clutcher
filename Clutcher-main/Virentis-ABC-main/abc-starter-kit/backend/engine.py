"""SkillBridge analysis engine: skill-gap analysis, For You recommendations, trending, interview prep.

Runs entirely on our server with no API keys, so it is fast and cannot fail during a demo.
All functions take plain feed items (see sources._item) and a list of the student's skills.
"""
import hashlib
import math
import re
from datetime import date
from urllib.parse import quote_plus

import skills_vocab


# ---------- shared ----------
def _days_left(item, today=None):
    if not item.get("deadline"):
        return None
    try:
        return (date.fromisoformat(item["deadline"]) - (today or date.today())).days
    except ValueError:
        return None


def _skill_sets(item, user_skills):
    """Split the listing's skills into have / transferable / missing for this student."""
    mine = {s.lower(): s for s in skills_vocab.canonical_list(user_skills)}
    need = item.get("skills") or skills_vocab.find_in_text(item.get("description", ""), limit=6)
    have, transferable, missing = [], [], []
    for skill in need:
        if skill.lower() in mine:
            have.append(skill)
            continue
        close = next((m for m in mine.values() if skills_vocab.related(m, skill)), None)
        if close:
            transferable.append({"skill": skill, "via": close})
        else:
            missing.append(skill)
    return need, have, transferable, missing


def fit_score(item, user_skills):
    need, have, transferable, _missing = _skill_sets(item, user_skills)
    if not need:
        return 30  # nothing to compare against, so rank below listings we can actually check
    return round(100 * (len(have) + 0.5 * len(transferable)) / len(need))


def _popularity(item, all_items):
    """0..1, log-scaled against the most-registered listing of the same type."""
    regs = item.get("registrations") or 0
    peak = max((i.get("registrations") or 0 for i in all_items if i["type"] == item["type"]), default=0)
    if not regs or not peak:
        return 0.0
    return math.log1p(regs) / math.log1p(peak)


def _fmt_int(n):
    return f"{n:,}" if isinstance(n, int) else str(n)


# ---------- 1. skill-gap analysis ----------
def analyze(item, user_skills):
    need, have, transferable, missing = _skill_sets(item, user_skills)
    score = fit_score(item, user_skills)
    days_left = _days_left(item)

    gaps = []
    for skill in missing:
        info = skills_vocab.info(skill)
        gaps.append({"skill": skill, **info})
    gaps.sort(key=lambda g: g["days"])
    prep_days = sum(g["days"] for g in gaps[:3])

    if score >= 75:
        verdict, verdict_key = "Ready to apply", "ready"
    elif score >= 45:
        verdict, verdict_key = "Apply after focused prep", "almost"
    else:
        verdict, verdict_key = "Build the core skills first", "stretch"
    if days_left is not None and 0 <= days_left < 3 and verdict_key != "ready":
        verdict, verdict_key = "Apply now anyway — it closes very soon", "urgent"

    kind = item["type"]
    org = item.get("organization") or "the organiser"
    steps = []
    if have:
        lead = ", ".join(have[:3])
        steps.append({
            "title": "Lead with your strengths",
            "detail": f"Put {lead} at the top of your resume and link one project that proves each. "
                      f"This is what {org} will scan for first.",
        })
    for t in transferable[:2]:
        steps.append({
            "title": f"Bridge {t['via']} → {t['skill']}",
            "detail": f"You already know {t['via']}, so {t['skill']} is a short hop. "
                      f"Spend 2–3 days on the basics: {skills_vocab.info(t['skill'])['resource']}",
        })
    urgent = days_left is not None and days_left < prep_days
    for g in gaps[: (2 if urgent else 3)]:
        steps.append({
            "title": f"Learn {g['skill']} (~{g['days']} days)",
            "detail": f"{g['project']}. Free resource: {g['resource']}",
            "resource": g["resource"],
        })
    if kind == "hackathon" or kind == "competition":
        team = next((r for r in item.get("requirements", []) if r.startswith("Team size")), None)
        steps.append({
            "title": "Lock in your team and idea",
            "detail": (f"{team}. " if team else "") +
                      "Pick teammates who cover your missing skills, and sketch the idea in one paragraph before you register.",
        })
    else:
        steps.append({
            "title": "Practise the interview",
            "detail": "Open Interview Prep on this listing for past questions and the questions we predict for this role.",
        })
    if days_left is not None:
        steps.append({
            "title": "Register before the deadline",
            "detail": f"Registration closes in {days_left} day{'s' if days_left != 1 else ''} ({item['deadline']}). "
                      + ("Register today and prepare in parallel." if urgent else "Block time in your calendar now."),
        })

    strengths = f"You already cover {len(have)} of {len(need)} required skills" if need else "This listing doesn't list specific skills"
    if transferable:
        strengths += f", and {len(transferable)} more are close to what you know"
    summary = (
        f"{strengths}. "
        + (f"Your biggest gaps are {', '.join(g['skill'] for g in gaps[:3])}, "
           f"about {prep_days} days of focused work. " if gaps else "There are no hard skill gaps. ")
        + {"ready": "You are a strong candidate. Apply and focus on showing proof of work.",
           "almost": "You are close. Close the top gap with one small project, then apply.",
           "stretch": "Treat this as a stretch goal. Build the core skills first, or apply for the experience.",
           "urgent": "The deadline is very close, so register now and prepare in parallel."}[verdict_key]
    )

    return {
        "opportunity_id": item["id"],
        "readiness": score,
        "verdict": verdict,
        "verdict_key": verdict_key,
        "summary": summary,
        "have": have,
        "transferable": transferable,
        "missing": gaps,
        "prep_days": prep_days,
        "days_left": days_left,
        "steps": steps,
        "requirements": item.get("requirements", []),
    }


# ---------- 2. For You recommendations ----------
def recommend(items, user_skills, types=None, limit=15):
    types = set(types or [])
    pool = [i for i in items if not types or i["type"] in types]
    scored = []
    for item in pool:
        need, have, transferable, missing = _skill_sets(item, user_skills)
        fit = fit_score(item, user_skills) / 100
        if need and not have and not transferable:
            continue
        pop = _popularity(item, items)
        days_left = _days_left(item)
        urgency = 0.0
        if days_left is not None:
            urgency = 1.0 if 2 <= days_left <= 14 else 0.6 if days_left <= 30 else 0.3
        score = 0.6 * fit + 0.25 * pop + 0.15 * urgency
        reasons = []
        if have:
            reasons.append(f"You have {', '.join(have[:3])}" + (f" (+{len(have) - 3} more)" if len(have) > 3 else ""))
        if transferable:
            reasons.append(f"Your {transferable[0]['via']} transfers to {transferable[0]['skill']}")
        if item.get("registrations"):
            reasons.append(f"{_fmt_int(item['registrations'])} students registered")
        if days_left is not None and days_left <= 14:
            reasons.append(f"Closes in {days_left} day{'s' if days_left != 1 else ''}")
        if item.get("compensation"):
            reasons.append(item["compensation"])
        if missing:
            first = skills_vocab.info(missing[0])
            action = f"Learn {missing[0]} first (~{first['days']} days), then apply"
        elif transferable:
            action = f"Apply now — brush up on {transferable[0]['skill']} before the interview"
        else:
            action = "Apply now — you match every listed skill" if need else "Apply now"
        scored.append({
            "item": item,
            "score": round(score * 100),
            "fit": round(fit * 100),
            "reasons": reasons[:4],
            "action": action,
            "missing": missing[:4],
        })
    scored.sort(key=lambda r: (-r["score"], r["item"]["title"]))

    # Keep the list varied: at most 6 of any one type and 2 of any one job title,
    # so it isn't 15 copies of "Data Analyst Internship".
    picked, per_type, per_title = [], {}, {}
    for rec in scored:
        t = rec["item"]["type"]
        title = re.sub(r"[^a-z]+", " ", rec["item"]["title"].lower()).strip()
        if per_type.get(t, 0) >= (limit if types and len(types) == 1 else 6) or per_title.get(title, 0) >= 2:
            continue
        per_type[t] = per_type.get(t, 0) + 1
        per_title[title] = per_title.get(title, 0) + 1
        picked.append(rec)
        if len(picked) >= limit:
            break
    for rank, rec in enumerate(picked, 1):
        rec["rank"] = rank
    return picked


# ---------- 3. trending ----------
def trending(items, kind=None, limit=10, today=None):
    today = today or date.today()
    pool = [i for i in items if i.get("registrations") and (not kind or i["type"] == kind)]
    out = []
    for item in pool:
        regs = item["registrations"]
        age = None
        if item.get("posted"):
            try:
                age = max(1, (today - date.fromisoformat(item["posted"])).days)
            except ValueError:
                age = None
        per_day = round(regs / age, 1) if age else None
        # Momentum blends total interest with how fast it is arriving.
        momentum = math.log1p(regs) + (math.log1p(per_day) if per_day else 0)
        out.append({"item": item, "registrations": regs, "per_day": per_day,
                    "views": item.get("views"), "momentum": round(momentum, 3)})
    out.sort(key=lambda r: -r["momentum"])
    for rank, row in enumerate(out[:limit], 1):
        row["rank"] = rank
    return out[:limit]


# ---------- 4. interview prep ----------
ROLE_PATTERNS = [
    ("frontend", r"front[- ]?end|react|ui developer|web developer|angular|vue"),
    ("backend", r"back[- ]?end|java developer|node|django|spring|api|\.net"),
    ("data", r"data analy|business analy|analytics|bi developer|power bi|data scien"),
    ("ml", r"machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|nlp|computer vision|genai"),
    ("software", r"software|sde|developer|engineer|programmer|full[- ]?stack|qa|testing"),
    ("design", r"design|ui/ux|ux|graphic|figma"),
    ("product", r"product|founder'?s office|strategy|consult"),
    ("marketing", r"marketing|content|social media|seo|brand|growth"),
    ("sales", r"sales|business development|bde|relationship|account"),
]

PAST_QUESTIONS = {
    "software": [
        ("Reverse a linked list in place, then explain its time and space complexity.", "DSA", "Easy"),
        ("Find the first non-repeating character in a string.", "DSA", "Easy"),
        ("Given an array, return the length of the longest subarray with sum K.", "DSA", "Medium"),
        ("Detect a cycle in a directed graph.", "DSA", "Medium"),
        ("What is the difference between a process and a thread?", "Operating Systems", "Easy"),
        ("Explain the four pillars of OOP with a real example from your project.", "OOP", "Easy"),
        ("What happens when you type a URL into the browser and press Enter?", "Networks", "Medium"),
        ("Write a SQL query to find the second-highest salary in an Employee table.", "SQL", "Easy"),
        ("Explain indexing in databases. When can an index make things slower?", "DBMS", "Medium"),
        ("Tell me about the hardest bug you've fixed.", "Behavioural", "Easy"),
    ],
    "frontend": [
        ("Explain the virtual DOM and how React reconciles changes.", "React", "Medium"),
        ("What is the difference between useEffect and useLayoutEffect?", "React", "Medium"),
        ("Explain event bubbling, capturing and delegation.", "JavaScript", "Easy"),
        ("What is a closure? Write a counter function that uses one.", "JavaScript", "Easy"),
        ("Implement debounce from scratch.", "JavaScript", "Medium"),
        ("How does the CSS box model work? What does box-sizing change?", "CSS", "Easy"),
        ("How would you make a slow React list render faster?", "Performance", "Medium"),
        ("Explain the difference between == and ===, and between let, const and var.", "JavaScript", "Easy"),
    ],
    "backend": [
        ("Design a REST API for a URL shortener. Which endpoints and status codes?", "API design", "Medium"),
        ("What is the difference between SQL and NoSQL databases? When would you pick each?", "Databases", "Easy"),
        ("Explain ACID properties with an example.", "DBMS", "Easy"),
        ("How does JWT authentication work, and where should the token be stored?", "Security", "Medium"),
        ("How would you handle 10x traffic on an API overnight?", "System design", "Hard"),
        ("Explain database normalisation up to 3NF.", "DBMS", "Medium"),
        ("What is the N+1 query problem and how do you fix it?", "Performance", "Medium"),
    ],
    "data": [
        ("Write a SQL query for the top 3 products by revenue in each category.", "SQL", "Medium"),
        ("What is the difference between WHERE and HAVING?", "SQL", "Easy"),
        ("How do you handle missing values in a dataset?", "Data cleaning", "Easy"),
        ("Explain the difference between mean, median and mode. When is the median better?", "Statistics", "Easy"),
        ("Revenue dropped 20% last week. How would you investigate?", "Case", "Medium"),
        ("What is a p-value? Explain it to a non-technical manager.", "Statistics", "Medium"),
        ("Which chart would you use to show a trend over time, and why?", "Visualisation", "Easy"),
    ],
    "ml": [
        ("Explain the bias–variance trade-off.", "ML theory", "Medium"),
        ("How do you detect and handle overfitting?", "ML theory", "Easy"),
        ("Precision vs recall: which matters more for a spam filter? For cancer detection?", "Metrics", "Medium"),
        ("Explain how gradient descent works.", "ML theory", "Easy"),
        ("What is the difference between bagging and boosting?", "Ensembles", "Medium"),
        ("How does a transformer's attention mechanism work, at a high level?", "Deep learning", "Hard"),
        ("Walk me through an ML project end to end: data, model, evaluation, deployment.", "Project", "Medium"),
    ],
    "design": [
        ("Walk me through your design process on one portfolio project.", "Portfolio", "Easy"),
        ("How do you decide between two design options without user data?", "Process", "Medium"),
        ("Redesign the checkout flow of an app you use. What would you change?", "Design task", "Medium"),
        ("What makes a design accessible?", "Accessibility", "Easy"),
    ],
    "product": [
        ("How would you improve an app you use every day?", "Product sense", "Medium"),
        ("How would you prioritise 10 feature requests with limited engineers?", "Prioritisation", "Medium"),
        ("Estimate the number of food delivery orders in Bangalore per day.", "Guesstimate", "Medium"),
        ("Which metric would you track for a new feature's success, and why?", "Metrics", "Medium"),
    ],
    "marketing": [
        ("How would you grow an Instagram page from 0 to 10K followers?", "Growth", "Medium"),
        ("Pitch a campaign for a product launching next month.", "Campaign", "Medium"),
        ("Which metrics tell you a campaign is working?", "Analytics", "Easy"),
        ("Tell me about a brand whose marketing you admire, and why.", "Brand sense", "Easy"),
    ],
    "sales": [
        ("Sell me this pen.", "Role play", "Easy"),
        ("How would you handle a customer who says your product is too expensive?", "Objection handling", "Medium"),
        ("Walk me through how you'd find and qualify 50 leads in a week.", "Prospecting", "Medium"),
        ("Tell me about a time you persuaded someone to change their mind.", "Behavioural", "Easy"),
    ],
    "general": [
        ("Tell me about yourself.", "HR", "Easy"),
        ("Why do you want to work with us?", "HR", "Easy"),
        ("Describe a time you worked in a team that disagreed. What did you do?", "Behavioural", "Easy"),
        ("What is your biggest weakness, and what are you doing about it?", "HR", "Easy"),
        ("Where do you see yourself in two years?", "HR", "Easy"),
    ],
}

SKILL_QUESTIONS = {
    "Python": ["What is the difference between a list and a tuple?", "Explain decorators with an example.", "How do generators save memory?"],
    "Java": ["Explain the difference between HashMap and ConcurrentHashMap.", "Why are Strings immutable in Java?"],
    "C++": ["What is the difference between a pointer and a reference?", "Explain virtual functions and the vtable."],
    "JavaScript": ["Explain the event loop.", "What is the difference between a promise and async/await?"],
    "React": ["When would you use useMemo or useCallback?", "How do you manage global state without Redux?"],
    "SQL": ["Explain the different types of JOIN with an example.", "What is a window function? Give a use case."],
    "Machine Learning": ["How would you choose an evaluation metric for an imbalanced dataset?"],
    "Data Analysis": ["Walk me through cleaning a messy CSV you've worked with."],
    "Node.js": ["How does Node handle many requests on a single thread?"],
    "Git": ["What is the difference between merge and rebase?"],
    "Docker": ["What is the difference between an image and a container?"],
    "AWS": ["How would you host a web app on AWS cheaply?"],
    "Figma": ["How do you hand off a design to developers in Figma?"],
    "Communication": ["Explain a technical project to someone non-technical in one minute."],
    "Sales": ["How would you pitch our product in 30 seconds?"],
    "Marketing": ["How would you measure the ROI of a social media campaign?"],
    "Data Structures": ["When would you use a heap instead of a sorted array?"],
    "REST APIs": ["What makes an API RESTful? Which status code for a failed validation?"],
}


def _role(item):
    text = f"{item.get('title', '')} {' '.join(item.get('tags', []))}".lower()
    for role, pattern in ROLE_PATTERNS:
        if re.search(pattern, text):
            return role
    return "general"


def _rng(seed):
    """Deterministic pseudo-random sequence so the same listing always gives the same prediction."""
    h = hashlib.sha256(seed.encode()).digest()
    i = 0
    while True:
        yield h[i % len(h)] / 255
        i += 1


def interview_prep(item, user_skills):
    role = _role(item)
    org = item.get("organization") or "the company"
    _need, have, _transferable, missing = _skill_sets(item, user_skills)

    past = [{"question": q, "topic": t, "difficulty": d}
            for q, t, d in PAST_QUESTIONS.get(role, []) + PAST_QUESTIONS["general"][:3]]
    for skill in (item.get("skills") or [])[:5]:
        for q in SKILL_QUESTIONS.get(skill, [])[:2]:
            past.append({"question": q, "topic": skill, "difficulty": "Medium"})

    rnd = _rng(item["id"])
    predicted = []
    for skill in missing[:3]:
        predicted.append({
            "question": f"This role needs {skill}. How would you get productive with it in your first two weeks?",
            "why": f"{skill} is in the listing but not on your profile, so expect to be tested on it.",
        })
    for skill in have[:3]:
        predicted.append({
            "question": f"Walk us through a project where you used {skill}. What would you do differently now?",
            "why": f"You list {skill}, and it matches the role, so they'll probe how deep it goes.",
        })
    tag = next(iter(item.get("tags") or []), "")
    predicted += [
        {"question": f"Why {org}, and why this {item['type']} specifically?",
         "why": "Asked in almost every first round. Prepare a specific answer about this listing."},
        {"question": f"What do you know about what {org} does" + (f" in {tag}" if tag else "") + "?",
         "why": "Tests whether you researched the company before applying."},
        {"question": "Tell me about a time you learned a new tool quickly under a deadline.",
         "why": "Common for freshers and interns, especially when there are skill gaps."},
    ]
    for p in predicted:
        p["likelihood"] = round(55 + 40 * next(rnd))
    predicted.sort(key=lambda p: -p["likelihood"])

    company = quote_plus(org)
    role_q = quote_plus(item.get("title", ""))
    sources = [
        {"label": f"{org} interview experiences (GeeksforGeeks)",
         "url": f"https://www.geeksforgeeks.org/search/?gq={company}%20interview%20experience"},
        {"label": f"{org} interview questions (Glassdoor)",
         "url": f"https://www.glassdoor.co.in/Search/results.htm?keyword={company}%20interview"},
        {"label": "Similar role questions (LeetCode Discuss)",
         "url": f"https://leetcode.com/discuss/interview-question?query={role_q}"},
        {"label": f"{org} questions asked (AmbitionBox)",
         "url": f"https://www.ambitionbox.com/search?CompanyName={company}"},
    ]
    if item.get("source") == "Unstop" and item.get("org_url"):
        sources.insert(0, {"label": f"{org} selection process (Unstop)", "url": item["org_url"]})

    return {
        "opportunity_id": item["id"],
        "role": role,
        "past_questions": past[:14],
        "predicted_questions": predicted[:7],
        "sources": sources,
        "focus": [g for g in missing[:3]],
    }
