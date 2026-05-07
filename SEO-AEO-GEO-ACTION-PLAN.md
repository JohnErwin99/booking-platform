# Bookwize SEO / AEO / GEO Action Plan

## Competitor Landscape Summary

| Competitor | Title Tag Strategy | Schema | Blog | Local (Canada) | Weakness |
|---|---|---|---|---|---|
| **Booksy** | "All-in-One Booking & Scheduling Software" | SoftwareApp, FAQ | Active blog (salon tips, marketing, software guides) | en-ca subdomain exists | Heavy US focus, thin Canada content |
| **Acuity** | "Online Booking & Appointment Scheduling Software" | Organization, Product | Minimal blog, Squarespace parent SEO | No Canada-specific pages | No local targeting at all |
| **Fresha** | "Instantly book salons and spas nearby" | Marketplace-style listing pages | Comparison guides ("best salon software") | Marketplace listings by city | No local SEO tools for businesses, 20% new-client fee |
| **Vagaro** | "Salon, Spa, & Fitness Business Software" | Organization, Product | Comparison/listicle content ("Top 7 Salon Software") | Marketplace by city | No local SEO, no GBP management |
| **Square** | "Free Online Booking and Scheduling Software" | Organization, Product, FAQ | Townsquare blog (how-to guides, business advice) | Available in Canada, no city pages | Generic, not beauty-focused |
| **Setmore** | "Free Online Appointment Scheduling Software" | SoftwareApp | Light blog | No Canada targeting | Weak content, aging brand perception |

**Key gap:** None of these competitors produce Canada/Montreal-specific content. None rank for French-language queries. None offer white-label as a primary differentiator. Bookwize can own these niches.

---

## 1. Priority Keywords (25)

**Transactional (buy-intent)**
1. booking software pricing Canada
2. buy appointment scheduling software
3. white-label booking system
4. booking system free trial
5. online booking software for small business

**Informational (learn-intent)**
6. how to set up online booking for my salon
7. best booking system for barbershops 2026
8. best salon software Canada 2026
9. how to reduce no-shows salon
10. online booking vs phone booking benefits

**Local (Montreal / Canada)**
11. booking system Montreal
12. salon booking software Canada
13. logiciel de reservation Montreal (French)
14. barbershop software Montreal
15. appointment booking Canada small business
16. systeme de reservation en ligne Quebec

**Long-tail / Niche**
17. free booking system for barbershops
18. white-label booking platform for agencies
19. booking widget for WordPress salon
20. booking software with staff scheduling
21. Booksy alternative Canada
22. Fresha alternative no commission
23. booking software no marketplace fee
24. appointment system with CRM for salons
25. embeddable booking widget no code

---

## 2. Content Pages to Create

### Landing Pages (high-priority, create first)
- `/booking-software-canada` -- "Best Online Booking Software for Canadian Businesses (2026)"
- `/salon-booking-montreal` -- "Salon & Barbershop Booking Software in Montreal"
- `/alternative/booksy` -- "Bookwize vs Booksy: No Marketplace Fees, Full White-Label"
- `/alternative/fresha` -- "Bookwize vs Fresha: No 20% Commission on New Clients"
- `/alternative/vagaro` -- "Bookwize vs Vagaro: Compare Features & Pricing"
- `/white-label-booking` -- "White-Label Booking System for Agencies & Multi-Brand Businesses"

### Blog Posts (publish 2/month minimum)
- "How to Set Up Online Booking for Your Salon in Under 5 Minutes"
- "7 Best Booking Systems for Canadian Barbershops in 2026 (Honest Comparison)"
- "How Online Booking Reduces No-Shows by 38%: Data from Canadian Salons"
- "Phone Booking vs Online Booking: Why Salons Are Switching"
- "Complete Guide to White-Label Booking Software"
- "How to Embed a Booking Widget on WordPress, Wix, and Squarespace"
- "Booking Software Pricing Breakdown: What You Actually Pay with Booksy, Fresha, Vagaro, and Bookwize"

### French Content (major competitive gap)
- `/fr/logiciel-reservation-salon-montreal` -- French landing page for Montreal salons
- French FAQ section or duplicate landing page in French

---

## 3. AEO Optimization (Get Cited by AI)

**Question-answer content structure.** Every blog post and landing page must open with a direct 40-word definition/answer in the first paragraph. Format: `<h2>What is [topic]?</h2>` followed by a concise answer. AI models extract these as snippets.

**Entity building (make "Bookwize" a known entity).**
- Get listed on G2, Capterra, Software Advice, GetApp, Product Hunt. These are the sources AI models cite when recommending software.
- Create a Crunchbase profile, Wikipedia-eligible company page (once notable), and LinkedIn company page with consistent NAP (Name, Address, Phone).
- Ensure every third-party listing uses the exact same description: "Bookwize is an online booking and CRM platform for salons, barbershops, and service businesses in Montreal, Canada."

**Structured data additions needed now:**
- Add `HowTo` schema to the "How It Works" section (3-step setup).
- Add `Review` schema for each testimonial (currently missing -- only aggregate exists).
- Add `LocalBusiness` schema alongside `Organization` with full Montreal address, phone, hours.
- Add `BreadcrumbList` schema on all new content pages.
- Add `WebSite` schema with `SearchAction` for sitelinks search box.
- Change `priceCurrency` from `USD` to `CAD` in the `SoftwareApplication` schema, or list both.

**FAQ expansion.** Add 4-6 more FAQ items targeting AI-query patterns:
- "How much does Bookwize cost?"
- "Is Bookwize better than Fresha/Booksy/Vagaro?"
- "Does Bookwize work in Canada/Quebec?"
- "Can I use Bookwize without paying commission on bookings?"

---

## 4. GEO Optimization (Rank in Generative Search)

**Authoritative content signals.**
- Publish original data: "We analyzed 1,000+ bookings across Canadian salons -- here is what we found about no-show rates, peak booking times, and average service duration." AI models heavily favor pages with original statistics.
- Include specific numbers everywhere: "$19/month," "setup in under 5 minutes," "38% fewer no-shows," "1,000+ appointments booked." Vague claims get ignored by LLMs.

**Citation-worthy comparison tables.** Create HTML comparison tables (not images) on every `/alternative/*` page:

```
| Feature | Bookwize | Booksy | Fresha | Vagaro |
|---------|----------|--------|--------|--------|
| Monthly price | $19 | $29.99 | Free + 20% fee | $30 |
| Commission on bookings | None | None | 20% new clients | None |
| White-label | Full | No | No | Limited |
| Canada-focused | Yes | Partial | No | No |
```

**Recency.** Update comparison pages and key stats quarterly. AI models have strong recency bias -- pages updated within 90 days get cited 30-40% more.

**Quotable definitions.** On every key page, include a bolded 1-sentence definition: **"Bookwize is a commission-free online booking and CRM platform built for salons, barbershops, and service businesses in Canada, starting at $19/month."** This is what LLMs will extract and cite.

---

## 5. Technical SEO Improvements

**Critical fixes for bookwizeapp.com:**

1. **Site is not indexed.** `site:bookwizeapp.com` returns zero results. Verify Google Search Console ownership, submit sitemap, and check for accidental `noindex` on rendered pages (the meta tag says `index, follow` in source, but confirm the deployed version and any middleware that might override this).

2. **Sitemap is too thin.** Only 2 URLs listed. Add all public pages: landing, demo, signup, plus every new content page as created.

3. **Missing `hreflang` tags.** Add `<link rel="alternate" hreflang="en-ca" href="https://bookwizeapp.com/" />` and future French pages with `hreflang="fr-ca"`.

4. **No `<h1>` visible to crawlers.** The current H1 is "Stack your schedule." which has zero keyword value. Change to: "Online Booking System for Salons & Barbershops in Canada" and keep "Stack your schedule" as a styled tagline above or below it.

5. **Three.js hero blocks crawling.** The heavy 3D animation (three.js, 200+ lines of JS) renders before content. Add `loading="lazy"` or defer the script. Ensure LCP (Largest Contentful Paint) is under 2.5s.

6. **Missing Performance headers.** Add `Cache-Control` for static assets, enable Brotli/gzip compression, add `<link rel="preload">` for hero images.

7. **Aggregate rating may trigger a manual action.** The `aggregateRating` of 4.9 from 48 reviews in the `SoftwareApplication` schema must link to verifiable reviews. If these reviews do not exist on a public page, remove this schema or create a `/reviews` page.

8. **Footer links are dead.** "Help Center," "Contact," "Status," "Privacy Policy," "Terms of Service" all link to `#`. Create these pages or remove the links -- dead links hurt crawl quality signals.

---

## 6. Local SEO -- Montreal / Canada

1. **Google Business Profile.** Create a GBP listing for "Bookwize" with category "Software Company," address in Montreal, QC. Post weekly updates about features. This is the single highest-impact local action.

2. **Directories.** List on: Canadian Business Directory, YellowPages.ca, Yelp Canada, PagesJaunes.ca (French), Clutch.co, and Quebec business registries.

3. **French-language presence.** Create at least one French landing page. Quebec has 8M+ francophones searching in French. Zero competitors have French content for booking software. This is an uncontested niche.

4. **Montreal-specific content.** Blog post: "Top Booking Solutions for Montreal Salons and Barbershops." Name-drop neighborhoods (Plateau, Mile End, Old Montreal, NDG). This signals local relevance to both traditional search and AI models.

5. **Partner testimonials with location.** Update testimonial schema to include `addressLocality: "Montreal"` for each reviewer. Mention "Montreal" and "Canada" in testimonial text where natural.

6. **NAP consistency.** Ensure name, address, phone number are identical across bookwizeapp.com, GBP, all directories, and social profiles.

---

## Priority Execution Order

| Week | Action | Impact |
|------|--------|--------|
| 1 | Fix indexing (GSC, sitemap, verify no blocking), fix H1, create GBP | Critical |
| 2 | Add HowTo + Review + LocalBusiness schema, fix dead footer links | High |
| 3 | Create `/booking-software-canada` and `/salon-booking-montreal` pages | High |
| 4 | Submit to G2, Capterra, Product Hunt, Canadian directories | High |
| 5-6 | Create 3 comparison pages (`/alternative/booksy`, `/fresha`, `/vagaro`) | High |
| 7-8 | Publish first 4 blog posts with original data | Medium |
| 9-10 | Create French landing page, expand FAQ to 12+ items | Medium |
| Ongoing | 2 blog posts/month, quarterly updates to comparison pages | Sustained |
