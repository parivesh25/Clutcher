"""Canonical skill vocabulary: aliases, learning time and free resources.

Listings and student profiles spell skills many ways ("ReactJS", "react.js").
`canonical()` maps them to one name so matching and gap analysis compare like with like.
"""
import re

# name: (aliases, category, days to job-ready basics, free resource, practice project)
SKILLS = {
    "Python": (["py", "python3"], "language", 14, "https://docs.python.org/3/tutorial/", "Automate a boring task: a script that renames and sorts your downloads folder"),
    "Java": (["core java", "java 8", "j2ee"], "language", 21, "https://dev.java/learn/", "Build a console library-management system with classes and collections"),
    "C++": (["cpp", "c plus plus"], "language", 21, "https://www.learncpp.com/", "Solve 30 array/string problems on LeetCode in C++"),
    "C": (["c programming", "c language"], "language", 14, "https://www.learn-c.org/", "Write a linked list and a stack from scratch"),
    "JavaScript": (["js", "es6", "ecmascript", "vanilla js"], "language", 14, "https://javascript.info/", "Build a to-do app with local storage in plain JS"),
    "TypeScript": (["ts"], "language", 7, "https://www.typescriptlang.org/docs/handbook/", "Convert one of your JS projects to TypeScript"),
    "Go": (["golang"], "language", 14, "https://go.dev/tour/", "Write a tiny REST API with net/http"),
    "Kotlin": ([], "language", 14, "https://kotlinlang.org/docs/getting-started.html", "Build a simple Android counter app"),
    "Swift": ([], "language", 14, "https://www.swift.org/getting-started/", "Build a SwiftUI notes app"),
    "R": (["r programming"], "language", 14, "https://r4ds.hadley.nz/", "Analyse a Kaggle dataset and plot 3 insights"),
    "SQL": (["mysql", "postgresql", "postgres", "sqlite", "plsql", "t-sql", "rdbms", "database", "dbms"], "data", 10, "https://sqlbolt.com/", "Design a college-events database and write 15 queries on it"),
    "MongoDB": (["mongo", "nosql"], "data", 7, "https://learn.mongodb.com/", "Store and query a blog's posts and comments"),
    "React": (["reactjs", "react.js", "react js"], "frontend", 14, "https://react.dev/learn", "Build a movie search app using a public API"),
    "Next.js": (["nextjs", "next js"], "frontend", 10, "https://nextjs.org/learn", "Ship a personal portfolio on Vercel"),
    "Angular": (["angularjs"], "frontend", 14, "https://angular.dev/tutorials", "Build a task board with routing and forms"),
    "Vue": (["vuejs", "vue.js"], "frontend", 10, "https://vuejs.org/tutorial/", "Build a weather dashboard"),
    "HTML": (["html5"], "frontend", 5, "https://developer.mozilla.org/en-US/docs/Learn/HTML", "Recreate a landing page you like"),
    "CSS": (["css3", "scss", "sass"], "frontend", 7, "https://web.dev/learn/css", "Make that landing page responsive on mobile"),
    "Tailwind CSS": (["tailwind", "tailwindcss"], "frontend", 3, "https://tailwindcss.com/docs", "Restyle a page using only Tailwind utilities"),
    "Node.js": (["node", "nodejs", "express", "expressjs", "express.js"], "backend", 14, "https://nodejs.org/en/learn", "Build a REST API with Express and JWT login"),
    "Django": ([], "backend", 14, "https://docs.djangoproject.com/en/stable/intro/tutorial01/", "Build a polls app, then add login"),
    "Flask": ([], "backend", 7, "https://flask.palletsprojects.com/tutorial/", "Build a URL shortener API"),
    "FastAPI": (["fast api"], "backend", 7, "https://fastapi.tiangolo.com/tutorial/", "Expose an ML model behind a FastAPI endpoint"),
    "Spring Boot": (["spring", "springboot"], "backend", 21, "https://spring.io/guides", "Build a CRUD service with Spring Data JPA"),
    "REST APIs": (["rest", "rest api", "restful", "api development", "apis", "api integration"], "backend", 5, "https://restfulapi.net/", "Document and test your API with Postman"),
    "GraphQL": ([], "backend", 7, "https://graphql.org/learn/", "Add a GraphQL endpoint to an existing API"),
    "Git": (["github", "version control", "gitlab"], "tools", 3, "https://learngitbranching.js.org/", "Contribute one PR to an open-source repo"),
    "Linux": (["unix", "bash", "shell scripting", "shell"], "tools", 7, "https://linuxjourney.com/", "Write a bash script that backs up a folder daily"),
    "Docker": (["containers", "containerization"], "devops", 7, "https://docs.docker.com/get-started/", "Containerise one of your web projects"),
    "Kubernetes": (["k8s"], "devops", 14, "https://kubernetes.io/docs/tutorials/kubernetes-basics/", "Deploy your container to a local minikube cluster"),
    "AWS": (["amazon web services", "ec2", "s3", "lambda"], "cloud", 14, "https://aws.amazon.com/training/digital/", "Host a static site on S3 and a function on Lambda"),
    "Azure": (["microsoft azure"], "cloud", 14, "https://learn.microsoft.com/en-us/training/azure/", "Deploy a web app on Azure App Service"),
    "GCP": (["google cloud", "google cloud platform"], "cloud", 14, "https://cloud.google.com/learn/training", "Deploy a container on Cloud Run"),
    "CI/CD": (["github actions", "jenkins", "devops"], "devops", 5, "https://docs.github.com/en/actions/quickstart", "Add tests that run on every push with GitHub Actions"),
    "Data Structures": (["dsa", "data structure", "data structures and algorithms"], "cs", 30, "https://neetcode.io/roadmap", "Finish the NeetCode 150 Arrays and Linked List sections"),
    "Algorithms": (["algorithm", "problem solving", "competitive programming", "cp"], "cs", 30, "https://cp-algorithms.com/", "Solve 2 LeetCode problems a day for 3 weeks"),
    "OOP": (["object oriented programming", "oops", "object-oriented"], "cs", 5, "https://www.geeksforgeeks.org/introduction-of-object-oriented-programming/", "Model a parking lot with classes and interfaces"),
    "Operating Systems": (["os"], "cs", 10, "https://pages.cs.wisc.edu/~remzi/OSTEP/", "Summarise scheduling, paging and deadlocks in one-page notes"),
    "Computer Networks": (["networking", "cn", "tcp/ip"], "cs", 10, "https://www.geeksforgeeks.org/computer-network-tutorials/", "Explain what happens when you type a URL, end to end"),
    "System Design": (["hld", "lld", "low level design", "high level design"], "cs", 21, "https://github.com/donnemartin/system-design-primer", "Design a URL shortener and an Instagram feed on paper"),
    "Machine Learning": (["ml", "scikit-learn", "sklearn", "artificial intelligence", "artificial intelligence (ai)", "ai", "machine learning concepts", "ai/ml", "ai & ml"], "ai", 30, "https://www.kaggle.com/learn/intro-to-machine-learning", "Train and evaluate a model on a Kaggle competition"),
    "Deep Learning": (["dl", "neural networks", "pytorch", "tensorflow", "keras"], "ai", 30, "https://course.fast.ai/", "Fine-tune an image classifier on your own photos"),
    "Generative AI": (["genai", "gen ai", "llm", "llms", "large language models", "prompt engineering", "openai", "langchain", "rag"], "ai", 10, "https://huggingface.co/learn/llm-course", "Build a chatbot that answers questions about a PDF"),
    "NLP": (["natural language processing"], "ai", 21, "https://huggingface.co/learn/nlp-course", "Build a sentiment classifier for tweets"),
    "Computer Vision": (["cv", "opencv", "image processing"], "ai", 21, "https://opencv.org/university/free-courses/", "Detect faces in a webcam stream"),
    "Data Analysis": (["data analytics", "analytics", "pandas", "numpy", "excel", "ms excel", "microsoft excel", "advanced excel", "spreadsheets", "data cleaning", "data interpretation", "quantitative analysis"], "data", 14, "https://www.kaggle.com/learn/pandas", "Clean a messy dataset and present 5 insights"),
    "Data Visualization": (["tableau", "power bi", "powerbi", "matplotlib", "dashboards", "dashboard development"], "data", 7, "https://www.kaggle.com/learn/data-visualization", "Build a sales dashboard in Power BI or Tableau"),
    "Statistics": (["probability", "stats"], "data", 14, "https://www.khanacademy.org/math/statistics-probability", "Run an A/B test analysis on sample data"),
    "Android": (["android development", "android studio"], "mobile", 21, "https://developer.android.com/courses", "Publish a simple app to a test track"),
    "Flutter": (["dart"], "mobile", 14, "https://docs.flutter.dev/get-started/codelab", "Build a cross-platform expense tracker"),
    "React Native": ([], "mobile", 14, "https://reactnative.dev/docs/getting-started", "Port your React app to mobile"),
    "Figma": (["ui/ux", "ui ux", "ux design", "ui design", "wireframing", "prototyping"], "design", 7, "https://help.figma.com/hc/en-us/categories/360002051613", "Redesign your college website's home page"),
    "Cybersecurity": (["security", "ethical hacking", "network security", "penetration testing"], "security", 30, "https://tryhackme.com/", "Complete the TryHackMe Pre-Security path"),
    "Blockchain": (["web3", "solidity", "ethereum", "smart contracts"], "web3", 21, "https://cryptozombies.io/", "Deploy an ERC-20 token on a testnet"),
    "IoT": (["internet of things", "arduino", "raspberry pi", "embedded systems", "embedded"], "hardware", 14, "https://docs.arduino.cc/learn/", "Build a temperature sensor that posts readings online"),
    "Communication": (["communication skills", "verbal communication", "written communication", "english", "english language proficiency", "public speaking", "presentation skills", "public speaking and presentation skills", "technical presentations", "persuasive speaking"], "soft", 7, "https://www.coursera.org/learn/wharton-communication-skills", "Record a 2-minute pitch of your best project and refine it"),
    "Sales": (["business development", "negotiation", "lead generation", "b2b sales", "cold calling", "relationship management", "customer acquisition", "lead qualification", "crm software", "customer handling", "customer service"], "business", 7, "https://www.hubspot.com/sales/training", "Write and practise a 60-second cold call script"),
    "Marketing": (["digital marketing", "social media marketing", "seo", "content marketing", "branding", "marketing & branding", "social media management", "market research methods", "market research"], "business", 10, "https://learndigital.withgoogle.com/digitalgarage", "Grow a small Instagram page and report the numbers"),
    "Content Writing": (["copywriting", "blogging", "writing", "content creation"], "business", 7, "https://www.coursera.org/learn/writing-for-the-web", "Publish 3 blog posts on a topic you know"),
    "Finance": (["financial analysis", "accounting", "financial modelling", "valuation"], "business", 14, "https://corporatefinanceinstitute.com/resources/", "Build a 3-statement model of a listed company"),
    "Product Management": (["product", "pm", "product thinking"], "business", 14, "https://www.productschool.com/resources", "Write a PRD for a feature you wish an app had"),
    "Entrepreneurship": (["startup", "business strategy"], "business", 10, "https://www.ycombinator.com/library", "Write a one-page business plan and talk to 5 potential users"),
    "Leadership": (["team management", "teamwork", "management", "project management", "coordination skills"], "soft", 7, "https://www.mindtools.com/", "Lead a small club event and write what you learned"),
    "Problem Solving": (["analytical skills", "critical thinking", "logical reasoning", "aptitude", "decision making", "strategic thinking"], "soft", 10, "https://www.indiabix.com/", "Do one timed aptitude set daily for 2 weeks"),
}

_ALIAS = {}
for _name, (_aliases, *_rest) in SKILLS.items():
    _ALIAS[_name.lower()] = _name
    for _a in _aliases:
        _ALIAS[_a.lower()] = _name

# Longest aliases first so "react native" wins over "react" when scanning free text.
_SCAN = sorted(_ALIAS.items(), key=lambda kv: -len(kv[0]))
_SHORT_ALIASES = {"c", "r", "go", "os", "cv", "cn", "pm", "ts", "js", "py", "ml", "dl", "cp", "k8s", "seo", "rest", "apis", "spring", "product", "node", "security", "writing", "english", "management", "analytics", "shell", "database", "dbms", "stats", "embedded"}


def canonical(raw):
    """Map one skill string to its canonical name, or a tidy version of itself."""
    s = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not s:
        return ""
    return _ALIAS.get(s.lower(), s[:1].upper() + s[1:] if s.islower() else s)


def canonical_list(items):
    out, seen = [], set()
    for item in items or []:
        name = canonical(item)
        if name and name.lower() not in seen:
            seen.add(name.lower())
            out.append(name)
    return out


def parse_skill_text(text):
    """User-typed 'python, React , dsa' -> ['Python', 'React', 'Data Structures']."""
    return canonical_list(p for p in re.split(r"[,;\n/|]", text or "") if p.strip())


def find_in_text(text, limit=8):
    """Spot known skills in a free-text description (used when a listing gives no skill list)."""
    low = " " + re.sub(r"[^a-z0-9+#./ ]", " ", (text or "").lower()) + " "
    found = []
    for alias, name in _SCAN:
        if name in found or alias in _SHORT_ALIASES:
            continue
        if re.search(r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])", low):
            found.append(name)
            if len(found) >= limit:
                break
    return found


def info(name):
    """Learning info for a skill; sensible defaults for skills outside the vocabulary."""
    entry = SKILLS.get(canonical(name))
    if entry:
        _aliases, category, days, resource, project = entry
        return {"category": category, "days": days, "resource": resource, "project": project}
    query = re.sub(r"\s+", "+", name.strip())
    return {
        "category": "other",
        "days": 7,
        "resource": f"https://www.youtube.com/results?search_query={query}+full+course+for+beginners",
        "project": f"Build one small project that uses {name} and put it on GitHub",
    }


def related(a, b):
    """True when two different skills are close enough that knowing one helps with the other."""
    ea, eb = SKILLS.get(canonical(a)), SKILLS.get(canonical(b))
    return bool(ea and eb and ea[1] == eb[1] and ea[1] not in {"soft", "other"})
