# Amora Privacy Policy

**Last updated: September 15, 2026**

This Privacy Policy explains what information Amora ("Amora," "we," "us," or "our") collects when you use the Amora mobile app (the "App"), why we collect it, how it's used, and the choices you have. By using Amora, you agree to the collection and use of information as described here.

If anything below doesn't match what the App actually does by the time you read this, that's a bug in this policy, not a hidden feature — please tell us at sanjunepali2007@gmail.com.

---

## 1. Information We Collect

### 1.1 Account information
When you sign in, Amora uses **Clerk** as our authentication provider. We receive and store:
- Your email address
- Your display name
- A profile photo, if you choose to add one
- A unique account identifier

### 1.2 Photos you upload
Amora's core feature is fusing photos using AI. When you use it, we collect:
- Photos you upload of yourself and, if you use Couple or Group mode, photos of other people you upload (see Section 8 on your responsibilities when you do this)
- The AI-generated wallpaper images produced from those photos
- Any text prompt, description, or style choice you provide to guide the generation

### 1.3 Location information
If you link with a partner and turn on proximity wallpapers, Amora collects your **precise (GPS) location**, including in the background, so it can detect when you're near your linked partner and switch your wallpaper automatically. See **Section 4** for full detail — this is collected only for that feature, only while it's enabled, and is never used for anything else.

### 1.4 Purchase and subscription information
If you buy credits or subscribe to Amora Pro, our payment provider, **RevenueCat**, and the App Store or Google Play (whichever store you purchased through) share purchase records with us — the product purchased, price, and subscription status — so we can grant your credits/entitlements. Amora does not receive or store your payment card details; those are handled entirely by Apple or Google.

### 1.5 Advertising information
Amora shows ads through **Google AdMob**. AdMob and its partners may collect your advertising identifier and ad-interaction data to select and measure ads, and to determine rewarded-ad payouts. Where required (e.g., in the EEA/UK), we ask for your consent to this via a consent form before any personalized ads are shown.

### 1.6 Content you share publicly
If you choose to share a creation to Amora's community feed ("Posts"), the image, any title/caption you write, your display name, and public engagement metrics (views, recreation count) become visible to other users of the App.

### 1.7 Automatically collected technical information
Like most apps, Amora automatically receives some technical data with every request to our servers: your IP address, device/OS type, app version, and basic request logs, used for security, debugging, and keeping the service running.

### 1.8 Information we do **not** collect
Amora does not access your contacts, SMS, call history, or browsing history, and does not request microphone or camera-roll access beyond the specific photo you choose to pick or capture for a generation.

---

## 2. How We Use Information

We use the information above to:
- Create and manage your account
- Generate the AI wallpapers you request (Section 3)
- Power the couple-proximity wallpaper feature (Section 4)
- Process your purchases and manage your credits/subscription
- Show ads, including rewarded ads that grant credits
- Operate the community feed and points system, and enforce our content rules
- Provide customer support and respond to your requests
- Maintain the security, integrity, and reliability of the App
- Comply with legal obligations

We do **not** sell your personal information, and we do not use your uploaded photos for any purpose other than generating the result you asked for.

---

## 3. AI Photo Processing

To generate a fused wallpaper, the photo(s) you upload are sent securely to the AI provider currently powering that generation — today, that's **Google's Gemini API** and/or **Hugging Face's Inference Providers** (running the Qwen-Image-Edit model). These providers process the images to produce the output image and return it to Amora's servers. A lightweight, low-cost AI check may also run beforehand to flag a blurry or unusable photo before it's processed.

Use of these providers is governed by their own terms and data-handling practices in addition to this policy — see [Google's Gemini API terms](https://ai.google.dev/gemini-api/terms) and [Hugging Face's terms](https://huggingface.co/terms-of-service). We don't control, and can't make representations about, whether a given provider uses submitted content to improve its own general-purpose models beyond what its own terms state; check the links above for the current position.

Your uploaded photos and the resulting generated images are stored in our cloud storage (Cloudflare R2) so you can access your own Gallery. They're deleted when you delete the specific creation, or when you delete your account (Section 9).

---

## 4. Location Data — Couple Proximity Feature

This section exists because Google Play and Apple require prominent, standalone disclosure of any app that collects location in the background, and we want to be completely clear about this rather than bury it in a general list.

- **What it's for:** if you link your account with a partner's and both of you turn on proximity wallpapers, Amora uses your device's GPS location to detect when you're physically near each other, so your phone can automatically switch to a shared couple wallpaper.
- **Who sees it:** your location is shared **only with your linked partner's device**, only to compute the distance between you. We do not display your precise coordinates to anyone, do not log a location history, do not use it for advertising or analytics, and do not sell it.
- **Background collection:** the App keeps checking your location in the background (a persistent notification is shown while this runs, per Android's own requirements) so the wallpaper can switch even when the App isn't open. If you'd rather this not happen in the background, turn the feature off — see below.
- **Your control:** proximity wallpapers are off by default and require an explicit opt-in from both partners. You can pause it anytime from the Couple tab (this instantly stops your location from being read or shared), and you can unlink from your partner entirely at any time, which also deletes both of your stored location records.
- **What we store:** only your single most recent location point (used to compute the live distance), not a history. It's deleted immediately if you unlink or turn the feature off, and permanently deleted if you delete your account.

---

## 5. How We Share Information

We share information only as needed to run the App:

| Who | What they receive | Why |
|---|---|---|
| **Clerk** | Email, name, account ID | Authentication / sign-in |
| **Cloudflare R2** | Uploaded and generated photos | Storage |
| **Google Gemini API / Hugging Face** | Photos submitted for a generation | AI image processing |
| **RevenueCat** | Purchase/subscription events, account ID | Entitlement & subscription management |
| **Apple App Store / Google Play** | Payment details (handled entirely by them) | Billing |
| **Google AdMob** | Advertising ID, ad interaction data | Showing and measuring ads |

We may also disclose information if required by law, to protect the rights, safety, or property of Amora or our users, or in connection with a merger, acquisition, or sale of assets (with notice to you where required).

We do not sell your personal information to data brokers or third parties for their own marketing purposes.

---

## 6. Data Retention

We keep your information for as long as your account is active, so the App can function (showing your Gallery, your posts, your credit balance, etc.). When you delete your account (Section 9), we permanently delete your photos, generated images, posts, location data, purchase history records tied to you, and account profile from our systems. Some limited records may be retained longer where required by law (e.g., billing records for tax/accounting purposes) or by the App Store/Play Store's own retention rules for purchase records, which are outside our control.

---

## 7. Your Rights and Choices

- **Delete your account and data:** Profile → Delete Account, inside the App. This is a real, permanent deletion — it removes your photos, posts, credits, points, purchase history, and couple link, and unpairs your partner automatically. It does not cancel an active subscription — cancel that separately from your Apple ID or Google Play subscription settings, or you may keep being charged. See the in-app screen for full detail before you use it.
- **Access or correct your data:** contact us at sanjunepali2007@gmail.com and we'll help you review or correct the information we hold about you.
- **Location:** turn off proximity wallpapers anytime in the Couple tab; the App simply won't read or share your location while it's off.
- **Ads:** you can limit ad personalization through your device's own ad settings (e.g., Android Settings → Privacy → Ads), and where a consent form is shown (EEA/UK), you can change your choice at any time from Amora's privacy settings.
- **Marketing communications:** we currently don't send marketing email; if that changes, any such email will include an unsubscribe option.

If you're in the EEA, UK, or a jurisdiction with similar law, you may also have rights to data portability, restriction of processing, and to lodge a complaint with your local data protection authority. If you're a California resident, you have rights under the CCPA/CPRA to know, delete, and opt out of the "sale" or "sharing" of your personal information — as stated above, we don't sell your personal information.

---

## 8. Photos of Other People (Couple/Group Mode)

When you upload a photo of another person — your partner, a friend, a family member — to generate a Couple or Group creation, **you confirm that you have that person's permission to upload their photo and have it processed by Amora and its AI providers as described in this policy.** Don't upload identifiable photos of someone who hasn't agreed to it. If someone believes their photo was uploaded without consent, contact us at sanjunepali2007@gmail.com and we will investigate and remove it.

---

## 9. Children's Privacy

Amora is not directed at, and is not intended for use by, children under **13** (or the minimum age of digital consent in your country, if higher — 16 in some EU member states). We do not knowingly collect personal information from children below that age. If we learn that we've collected information from a child under the applicable age without appropriate consent, we'll delete it. If you believe a child has used Amora and provided us information, contact sanjunepali2007@gmail.com.

---

## 10. International Data Transfers

Amora's infrastructure providers (including Clerk, Cloudflare, Google, Hugging Face, and Neon) operate servers in multiple countries, including the United States. By using Amora, you understand your information may be processed in a country other than the one you live in, which may have different data protection laws. We rely on our providers' own compliance mechanisms (such as Standard Contractual Clauses, where applicable) for these transfers.

If you're in South Korea, this means your information is generally processed outside the Republic of Korea. Amora is operated from South Korea and takes reasonable steps consistent with the Personal Information Protection Act (PIPA) for users there; if you have PIPA-specific questions or requests, contact us at the email in Section 13.

---

## 11. Security

We use reasonable technical and organizational measures to protect your information — encrypted connections (HTTPS) for all data in transit, access-controlled cloud storage, and authentication tokens rather than storing passwords ourselves (Clerk handles that). No method of transmission or storage is 100% secure, and we can't guarantee absolute security.

---

## 12. Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we'll update the "Last updated" date above and, where required, notify you in-app or by email before the change takes effect. Continuing to use Amora after a change takes effect means you accept the updated policy.

---

## 13. Contact Us

Questions, requests, or concerns about this policy or your data:

**Email:** sanjunepali2007@gmail.com
**Developer:** Sanjeeb Nepali

See also our [Terms of Service](terms-of-service.html).
