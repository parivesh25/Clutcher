#!/usr/bin/env python3
"""CLI utility to scrape opportunity URLs using Firecrawl and ingest into Supabase.

Usage:
    python scrape.py https://devpost.com/software/my-hackathon
    python scrape.py https://example.com/job/software-engineer --type internship
    python scrape.py --help
"""
import argparse
import json
import sys

from dotenv import load_dotenv

import db
import scraper

load_dotenv()


def main():
    parser = argparse.ArgumentParser(description="Scrape internships or hackathons with Firecrawl")
    parser.add_argument("url", help="Target opportunity URL to scrape")
    parser.add_argument("--type", choices=["internship", "hackathon"], help="Override opportunity type")
    parser.add_argument("--no-save", action="store_true", help="Only parse and output JSON without saving to Supabase")
    parser.add_argument("--api-key", help="Firecrawl API key override")

    args = parser.parse_args()

    print(f"[*] Initializing Firecrawl scraper for: {args.url}")
    f_scraper = scraper.FirecrawlScraper(api_key=args.api_key)

    try:
        scraped = f_scraper.scrape_url(args.url)
        print(f"[+] Scraped page successfully ({len(scraped.get('markdown', ''))} characters)")
    except Exception as exc:
        print(f"[-] Scrape failed: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        skills = db.list_skills()
    except Exception:
        skills = scraper.DEFAULT_CATALOGUE_SKILLS

    opportunity = f_scraper.parse_opportunity(scraped, catalogue_skills=skills)
    if args.type:
        opportunity["opportunity_type"] = args.type

    print("\n=== Extracted Opportunity ===")
    print(json.dumps(opportunity, indent=2))

    if args.no_save:
        print("\n[*] Skipped saving to database (--no-save flag provided).")
        return

    print("\n[*] Saving to Supabase...")
    try:
        existing = db.find_opportunity_by_source(opportunity["source_name"], opportunity["source_url"])
        if existing:
            print(f"[!] Opportunity already exists in database with ID: {existing['id']}")
            return

        created = db.insert_opportunity(opportunity)
        print(f"[+] Successfully saved to database! ID: {created.get('id')}")
    except Exception as exc:
        print(f"[-] Database save failed (check backend/.env Supabase config): {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
