# Plan: recommendations and Zomato-style notifications

Status: **planned, not started** (written 21 November 2026). Build later, as 1.0.5 or after.

## The starting point

Zomato and Swiggy learn from millions of orders; Campus Cart has very few so far, so a trained model would have
nothing to learn from yet. The plan starts with simple, explainable rules that work from the first day and get
better as orders come in. Everything runs in Postgres (Supabase) and the Firebase push the app already uses, so
there is no new cost.

What already exists and gets reused:

- `item_pairs` and `refresh_smart_picks` (nightly): items bought together in the last 60 days.
- `collections`: admin-curated sets (exam kit, fest merch).
- `campaigns` and `send_campaign`: admin push to everyone, a hostel or a batch (max 3 a day).
- `stock_alerts` and `notify_back_in_stock`: "tell me when it's back".
- `app_events`: funnel steps (who, which step, which shop, when).
- `push_outbox` and `send-push` (Expo + FCM), with Android channels per side.

## 1. Recommendation engine

What the big apps do: Swiggy's "go-to items" uses recency, frequency, periodicity (time of day/week) and popularity,
and cut cart-building time by over 15%. Swiggy's WhatToEat explains why each pick is shown. Zomato matches on taste
(cuisine, place type, price band) and shows popular places to new users.

### Phase 1: works now

| Shelf | How it picks | Label |
|---|---|---|
| Your usual | The student's own past items, by recency, frequency and time of day | "Your 4 pm chai" |
| Right now on campus | Best sellers for the current slot (breakfast 9–11, lunch 12–3, snacks 4–7, dinner 7–9); an admin collection per slot until there's data | "Popular at lunch" |
| Popular in your hostel | Best sellers at the student's usual drop point this week, only with at least 5 orders behind it | "Kailash is ordering…" |
| Goes well with (cart) | `item_pairs`, falling back to best sellers in the same category | "Often bought with Maggi" |

Rules for every shelf: show the reason; only in-stock items at open shops; no "trending" or "popular" label with
fewer than 5 orders behind it.

Build notes: one SQL function `for_you(p_student)` returning shelves with items and reasons; log `rec_shown`,
`rec_tap` and `rec_add` in `app_events` to measure each shelf.

### Phase 2: after about 500 orders

One personal score per item: affinity (category and shop) + time-slot match + popularity + recency decay. It's
recalculated nightly, and the weights are tuned from the tap and add-to-cart counts.

### Phase 3: later

A/B test weightings; move to a learned ranking only once the data justifies it.

## 2. "Crazy" notifications, like Zomato

What's known: short, funny, chatty lines with puns, personal details and well-chosen timing, often tied to
festivals, cricket and the season. Benchmarks warn that promotional pushes drive most people switching
notifications off, while order updates drive almost none.

### Rules built into the system

- Three kinds of notification: order updates (no limit, as now), personal nudges, and campaigns.
- Fun pushes: at most 1 a day and 4 a week per student; only 9 am–9 pm and only while the shop involved is open.
- An Account switch, "Fun reminders", and an automatic pause after 5 ignored in a row.
- The same line is never sent to the same student within 30 days, and several variations take turns.
- One SQL gate, `can_nudge(p_student, p_kind)`, enforces all of the above. A `push_log` table keeps the template,
  student, time and whether it was opened (tapping the notification logs `push_open`).

### Triggers (cron every 5 minutes)

1. Usual time, only if they've ordered in that slot before: *"Asha, it's 4:07. Your chai is 6 minutes away ☕"*
2. Left in the cart, 30 minutes later, if the shop is still open: *"Your Maggi is feeling lonely in the cart 🥺"*
3. Last call at 8:30 pm, for people who usually order late: *"Booth 4 shuts at 9. Last chance for all-nighter fuel 🌙"*
4. Back in stock (existing stock alerts): *"Good news: Cold Coffee is back at Nescafé 🧊"*
5. We miss you, after 7 days with no order: *"Booth 4 asked about you. We said you're busy studying. Were you? 👀"*
6. Weather (Open-Meteo: free, no key, phase 2): *"It's raining in Hamirpur. Pakoras > umbrellas ☔"*
7. Admin-scheduled moments: exams, match days, Diwali and Holi, NITH fests.

### Admin

A line library with placeholders `{name}`, `{item}`, `{shop}` and `{minutes}`, several variations per trigger,
and each line's sent and opened counts so weak lines can be dropped (witty vs plain A/B).

## Phase 1 scope and size

Roughly two to three days:

- the four Home shelves with reasons;
- the notification system with its caps and `push_log`;
- triggers 1–5;
- the line library;
- the "Fun reminders" switch;
- open counts in admin.

Later: weather, personal scoring and A/B weighting.

## Sources

- Zomato push notification strategy (Juno School): https://junoschool.pages.dev/article/zomato-push-notification-strategy/
- The Zomato marketing playbook (Purshology): https://www.purshology.com/2026/07/the-zomato-marketing-playbook-winning-millennials-with-push-notifications/
- New age brands redefined push notifications (Social Samosa): https://www.socialsamosa.com/2022/11/new-age-brands-redefined-age-old-push-notifications
- Zomato personalised match scores (YourStory): https://yourstory.com/2025/02/zomato-personalized-match-scores
- How Zomato uses data science (Analytics India Magazine): https://analyticsindiamag.com/the-amazing-way-zomato-uses-data-science-for-success/
- Swiggy WhatToEat (Deccan Herald): https://www.deccanherald.com/business/swiggy-introduces-whattoeat-feature-offering-customised-food-choices-to-users-1233842
- Instamart "Your go-to items" (Swiggy Design): https://medium.com/swiggydesign/episode-i-your-go-to-items-5841078e7ae0
- Personalizing Swiggy POP recommendations (Swiggy Bytes): https://bytes.swiggy.com/personalizing-swiggy-pop-recommendations-d434b6f555f9
- Push notification benchmarks for 2026 (Airship): https://www.airship.com/mobile-app-push-notification-benchmarks-for-2026/
- Reducing push opt-out rates (SuprSend): https://www.suprsend.com/post/reduce-push-notification-opt-out-rates
- Frequency capping (OneSignal): https://onesignal.com/blog/prevent-overmessaging-frequency-capping/
