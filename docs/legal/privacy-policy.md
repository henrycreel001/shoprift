# Privacy Policy

**Version:** 1.0  
**Last updated:** 2026-05-17  
**Jurisdiction:** India (primary); GDPR (EU sellers); CCPA (California sellers)  
**Governing law:** Digital Personal Data Protection Act 2023 (India); Information Technology Act 2000; IT Rules 2011

---

## 1. Introduction

Shoprift ("we", "us") is committed to protecting the personal data of everyone who uses our service. This Privacy Policy explains what data we collect, why we collect it, how we use it, and your rights over it.

This Policy applies to:
- Sellers who use Shoprift to migrate their store data
- Visitors to the Shoprift website

If you are an EU resident, additional rights under GDPR apply (see Section 11). If you are a California resident, additional rights under CCPA apply (see Section 12).

---

## 2. Who We Are

**Data Fiduciary (Indian law) / Data Controller (GDPR):**  
Mayank Malik, operating as Shoprift  
Email: 001henrycreel@gmail.com  
Grievance Officer: See Section 13 and `docs/legal/grievance-officer.md`

---

## 3. What Data We Collect

### 3.1 Data you provide directly

| Data | Why we collect it |
|------|------------------|
| Name | To address you in communications |
| Email address | To deliver your Delivery Package and send service updates |
| Phone/WhatsApp number (concierge mode only) | To deliver your Delivery Package in concierge mode |
| Source Platform URL | To run the extraction job |
| Payment details (processed by Razorpay) | We do not store card details — Razorpay handles this |

### 3.2 Data collected automatically

| Data | Why we collect it |
|------|------------------|
| IP address | Security, fraud prevention, consent record |
| Browser/device information (user agent) | Consent record; fraud prevention |
| Pages visited on Shoprift website | Service improvement; debugging |
| Extraction job logs | Debugging; support; fraud prevention |

### 3.3 Data from the Seller's Source Platform

Shoprift extracts store data (products, images, descriptions, pricing) from the Source Platform on the Seller's instruction. This data is used solely to produce the Delivery Package and is not used for any other purpose. We do not knowingly extract the personal data of the Seller's end-customers. If such data is present in the store structure, we will not extract it unless explicitly instructed and legally justified.

### 3.4 Data we do NOT collect

- Passwords or authentication credentials for the Source Platform
- Payment card numbers or bank account details (handled by Razorpay)
- Biometric data
- Sensitive personal data as defined under the DPDP Act

---

## 4. Legal Basis for Processing

*(DPDP Act §6 requires purpose-specific, informed, withdrawable consent. GDPR Art. 6 requires a lawful basis for each processing activity.)*

| Processing activity | Legal basis (India/DPDP) | Legal basis (GDPR) |
|--------------------|--------------------------|-------------------|
| Running extraction job | Consent (at acceptance of Migration Consent Agreement) | Performance of contract |
| Delivering Delivery Package | Performance of contract | Performance of contract |
| Payment processing | Performance of contract | Performance of contract |
| Fraud prevention and security | Legitimate interest | Legitimate interest |
| Compliance with legal obligations | Legal obligation | Legal obligation |
| Consent record keeping | Legal obligation | Legal obligation |
| Service improvement and analytics | Legitimate interest | Legitimate interest |

---

## 5. How We Use Your Data

We use your personal data for the following specific purposes only:

**5.1** To authenticate your request and verify you are the store owner (or their authorised agent).

**5.2** To run the extraction job and produce your Delivery Package.

**5.3** To deliver your Delivery Package to you.

**5.4** To process your payment and issue receipts or refunds.

**5.5** To maintain a consent record showing you accepted the Migration Consent & Authorisation Agreement before extraction.

**5.6** To respond to your support queries.

**5.7** To detect and prevent fraud and abuse of the Service.

**5.8** To comply with applicable laws, regulations, and lawful orders.

We do not use your data for advertising, profiling, or sale to third parties.

---

## 6. Data Sharing

We share your personal data only in the following limited circumstances:

**6.1 Razorpay** — for payment processing. Razorpay processes your payment details under their own privacy policy. We receive payment confirmation only; we do not receive full card details.

**6.2 Supabase** — our database and file storage provider, used to store job metadata, consent records, and Delivery Packages. Supabase is a US-based provider. Data transfers are subject to appropriate safeguards (see Section 9).

**6.3 Railway / Vercel** — our infrastructure providers for hosting the extraction engine and web app.

**6.4 Legal obligation** — we may share data if required by a court order, government request, or applicable law. We will notify you of any such request where legally permitted to do so.

We do not sell your data to any third party. We do not share your data for marketing purposes.

---

## 7. Retention

| Data | Retention period |
|------|-----------------|
| Extraction job working files (images, raw JSON) | Deleted within 30 days of delivery |
| Delivery Package (in Supabase Storage) | 7 days from delivery (signed URL expires) |
| Consent records | 3 years from acceptance date (legal requirement) |
| Payment records | 7 years (tax and accounting obligations) |
| Support communications | 2 years from last contact |
| Server logs (IP, user agent) | 90 days |

---

## 8. Security

We implement the following technical and organisational measures to protect your data:

- Supabase Storage: private bucket, access via time-limited signed URLs only
- Database: role-based access control; no public access
- Extraction jobs: isolated per-job, not shared between users
- Infrastructure: hosted on Railway (engine) and Vercel (web app), both with TLS in transit
- Consent records: stored with timestamp, IP address, and user agent for audit integrity

No security measure is perfect. In the event of a data breach affecting your personal data, we will notify you and the relevant authority as required under applicable law.

---

## 9. International Data Transfers

Shoprift uses Supabase (US-based) and other infrastructure providers that may process data outside India. We ensure appropriate safeguards are in place for such transfers, including:

- Contractual data processing agreements with each provider
- Use of providers with established security certifications (SOC 2, ISO 27001 where available)

For EU residents: transfers to the US rely on Standard Contractual Clauses (SCCs) where adequacy decisions do not apply.

---

## 10. Your Rights (India — DPDP Act 2023)

Under the Digital Personal Data Protection Act 2023, you have the right to:

**10.1 Access.** Request a summary of your personal data we hold and the purposes for which we process it (DPDP §11).

**10.2 Correction.** Request correction of inaccurate or incomplete personal data (DPDP §12).

**10.3 Erasure.** Request deletion of your personal data where we no longer need it for the purpose it was collected, subject to legal retention obligations (DPDP §12).

**10.4 Withdraw consent.** Withdraw consent for processing based on consent at any time. Withdrawal does not affect the lawfulness of processing before withdrawal. Note that withdrawal after extraction has begun may not be possible without forfeiting the service (DPDP §6).

**10.5 Grievance redressal.** Raise a complaint with our Grievance Officer (see Section 13). If unresolved, you may approach the Data Protection Board of India once established.

To exercise any right, email: 001henrycreel@gmail.com

We will respond within 30 days.

---

## 11. Additional Rights — EU Residents (GDPR)

If you are in the European Union or European Economic Area, you have additional rights under the General Data Protection Regulation:

**11.1** Right to data portability (Art. 20 GDPR) — receive your data in a structured, machine-readable format.

**11.2** Right to object to processing based on legitimate interest (Art. 21 GDPR).

**11.3** Right to lodge a complaint with your national supervisory authority.

**11.4** Right not to be subject to solely automated decision-making that has legal or similarly significant effects (Art. 22 GDPR). Shoprift does not conduct such automated decision-making.

---

## 12. Additional Rights — California Residents (CCPA)

If you are a California resident, under the California Consumer Privacy Act:

**12.1** You have the right to know what personal information we collect, disclose, and sell (we do not sell personal information).

**12.2** You have the right to delete personal information we hold about you, subject to certain exceptions.

**12.3** You have the right to opt out of the sale of your personal information. Shoprift does not sell personal information.

**12.4** You have the right to non-discrimination for exercising your CCPA rights.

To exercise California rights, contact: 001henrycreel@gmail.com

---

## 13. Grievance Officer

In accordance with IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021, Rule 3(2):

**Grievance Officer:** Mayank Malik  
**Email:** 001henrycreel@gmail.com  
**Acknowledgement:** Within 24 hours of receipt  
**Resolution:** Within 15 days of receipt

Full notice: `docs/legal/grievance-officer.md`

---

## 14. Cookies

The Shoprift web app uses minimal cookies:

| Cookie | Purpose | Duration |
|--------|---------|----------|
| Session cookie | Maintain your logged-in state during a session | Session (deleted on browser close) |
| CSRF token | Security — prevent cross-site request forgery | Session |

We do not use advertising cookies, tracking pixels, or third-party analytics cookies. We do not use Google Analytics or similar trackers.

If this changes, we will update this Policy and seek fresh consent where required.

---

## 15. Children

The Service is not intended for anyone under the age of 18. We do not knowingly collect personal data from minors. If you believe we have done so, contact us immediately and we will delete it.

---

## 16. Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be notified to active users by email at least 14 days before taking effect. The updated version will be posted with a revised "Last updated" date and version number.

---

## 17. Contact

Mayank Malik | Shoprift  
Email: 001henrycreel@gmail.com

---

*Before publishing, obtain a one-time review by an Indian technology lawyer familiar with DPDP Act 2023 compliance (~₹15–30k). Required before any personal data is collected from web app users.*
