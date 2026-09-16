# Bue banana — Legal & Compliance Rules (rule.md)

Read this before writing any code that touches user data or user actions.

## PDPA (Personal Data Protection Act)

What it is: The PDPA protects personal data that can identify a person. It requires the product to have a lawful purpose for collecting and using personal data, collect only necessary data, protect it, and support the data subject’s rights.

What it requires: consent · purpose limit · minimise · access/correct/delete · sensitive data

Rules for the agent (write as many as you can):

- If the system stores an NFC identifier, it must treat the identifier as personal data when it can be linked to a user.
- If the system registers a new user, it must show a clear privacy notice before collecting personal data.
- If the system requests consent, it must use a separate, clear, and unticked consent control.
- If the system records consent, it must store the user ID, notice version, purpose, date, time, and consent status.
- If the system uses personal data, it must use the data only for the stated check-in, check-out, billing, payment, security, or legally required purpose.
- If a field is not necessary for providing the service or meeting a legal duty, the system must not collect it.
- If the system reads an NFC token, it must store a random internal identifier instead of unnecessary data directly on the NFC token.
- If an NFC token is lost, the system must allow staff to disable it and issue a new identifier without deleting required historical records.
- If the system displays a user profile, it must allow the user to access and correct inaccurate personal data.
- If a user requests deletion, the system must delete or anonymise data that is no longer legally required and explain any data that must still be retained.
- If a user withdraws consent, the system must stop processing that depends on consent unless another lawful basis applies.
- If the system stores check-in, check-out, billing, or payment data, it must encrypt the data in transit and at rest.
- If staff access personal data, the system must restrict access by role and grant only the minimum permissions needed.
- If the system shows customer information to staff, it must hide unnecessary fields and must not expose one customer’s data to another customer.
- If the system creates application logs, it must not write passwords, payment credentials, full payment-card data, or unnecessary personal data into the logs.
- If test or development data is required, the system must use synthetic or properly anonymised data instead of real customer data.
- If the system sends personal data to a payment provider or another third party, it must send only the minimum required data and document the purpose and recipient.
- If the system collects sensitive personal data, it must obtain explicit consent or confirm another lawful basis and apply stronger access controls.
- If a personal-data breach is detected, the system must preserve evidence and immediately alert the authorised responsible person.

## Computer Crime Act §26

What it is: Section 26 requires a qualifying service provider to retain computer traffic data that can identify users and their use of the service. The required log must normally be kept for at least 90 days, and an authorised official may order a longer period in a specific case.

What it requires: keep an access/traffic log ≥90 days, tied to a real user

Rules for the agent:

- If the system provides user accounts or NFC-based access, it must keep access and traffic logs that can be linked to the correct registered user.
- If a user checks in or checks out with NFC, the system must log the user/account identifier, NFC token identifier, action, date, time, result, and relevant system endpoint.
- If a user signs in to the web application, the system must log the account identifier, timestamp, source information required for traceability, and success or failure result.
- If staff change a check-in time, check-out time, rate, bill, or payment status, the system must log the staff account, original value, new value, reason, date, and time.
- If a traffic log is created, the system must use an accurate and consistent timestamp.
- If the system stores traffic logs, it must retain them for at least 90 days from the date the data enters the system.
- If a user closes an account or stops using the service, the system must continue retaining legally required identification and traffic data for at least 90 days after the service ends.
- If an authorised official issues a lawful retention order, the system must support preserving the specified logs for the required extended period.
- If the retention period expires and no lawful hold applies, the system must securely delete or irreversibly anonymise the logs according to the retention policy.
- If logs are stored, the system must protect them against unauthorised access, alteration, and deletion.
- If a person views, exports, or deletes logs, the system must record who performed the action, when it occurred, and what records were affected.
- If logs are requested, the system must disclose them only to an authorised person through a documented legal or internal approval process.
- If the system records traffic data, it must record necessary metadata and must not automatically store private message content or unnecessary personal content.
- If the product backlog is updated, log retention, access control, integrity, deletion, and retrieval must remain explicit non-functional requirements.

## Electronic Transactions Act §9 / 26 / 28

What it is: Section 9 recognises an electronic signature when the method can identify the signer, show the signer’s intention, and is reliable and appropriate for the transaction. Section 26 describes conditions supporting a reliable signature, while Section 28 imposes duties on certification service providers that issue certificates.

What it requires: valid e-signature test (§9) · presumed-reliable signature (§26) · CA duties (§28)

Rules for the agent:

- If the user clicks “I agree” to confirm a bill or payment, the system must record the identified user, exact terms or bill version, amount, date, time, and confirmation result.
- If an electronic confirmation is treated as a signature, the system must authenticate the user before accepting it.
- If the user confirms a charge, the system must display the final amount and relevant terms before the confirmation action.
- If the system asks for agreement, it must use a clear affirmative action and must not use a preselected checkbox as the user’s signature.
- If a signature or confirmation is recorded, the system must preserve evidence that links the action to the signer and shows the signer’s intention.
- If the signed or confirmed record changes, the system must make the change detectable and require a new confirmation when the change affects the agreement.
- If a staff member changes a confirmed bill, the system must preserve the original record and create an audit trail of the change.
- If the transaction has higher value or risk, the system must require a stronger authentication method appropriate to that risk.
- If the system uses an OTP, password, biometric method, or digital certificate for signing, it must prevent another person from using the method without authorisation.
- If signature credentials or keys are stored, the system must protect them with strong access controls and must never store them in source code or ordinary logs.
- If a user disputes an electronic confirmation, the system must be able to retrieve the confirmation record and its audit trail in a readable form.
- If the product uses a certificate issued by a Certification Authority (CA), the system must validate the certificate, issuer, validity period, revocation status, and intended use.
- If the company is not an authorised Certification Authority, the system must not claim to issue legally trusted digital certificates as a CA.
- If the product requires certificate-based signatures, it must use an appropriate established CA rather than create an unapproved CA service.
- If the company operates as a CA, it must comply with the duties in Section 28, including published practices, accurate certificate information, identity verification, revocation procedures, incident handling, and trustworthy systems and personnel.

Written by:

- Gritthaphat Intaraprasit — 6631503001
- Chatmongkhon Jaemiaeng — 6631503009
- Thanaruk Kammarat — 6631503021
- Patcha Kantaradusedee — 6631503032
- Supichaya Rabiabnaweenurak — 6631503118
