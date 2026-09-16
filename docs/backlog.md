# Product Backlog

## User Pain Points

- **Pain 1:** The existing board game website is inconvenient and not user-friendly for customers.
- **Pain 2:** Stakeholders need a better way to promote and sell 3D-printed board game products.
- **Pain 3:** The current check-in/check-out process requires staff assistance and may cause delays during busy periods.

---

## Backlog

| ID | User Pain | User Story / Requirement | Priority | Acceptance Criteria |
|---|---|---|---|---|
| PB-01 | Pain 3 | As a customer, I want to check in using an NFC tag so that I can enter the café quickly without waiting for staff. | High | The customer can scan an NFC tag and successfully check in. |
| PB-02 | Pain 3 | As a customer, I want to check out using an NFC tag so that I can complete the process without waiting for staff. | High | The customer can scan the NFC tag and successfully check out. |
| PB-03 | Pain 3 | As a staff member, I want the system to automatically record customer check-in and check-out times so that I do not need to record them manually. | High | The system automatically stores the customer's check-in and check-out timestamps. |
| PB-04 | Pain 3 | As a staff member, I want to view the current customer sessions so that I can monitor who is currently using the café. | High | Staff can view active customer sessions and their check-in times. |
| PB-05 | Pain 3 | As a café owner, I want the NFC system to work reliably during busy periods so that customers are not delayed. | High | The system can process multiple check-in/check-out activities without major errors or unacceptable delays. |
| PB-06 | Pain 1 | As a customer, I want a simple and easy-to-use interface so that I can access the system without confusion. | Medium | Main functions are clearly displayed and customers can complete common tasks without unnecessary steps. |
| PB-07 | Pain 1 | As a customer, I want to easily view board game café information so that I can find the information I need quickly. | Medium | Customers can access important café information from the main interface. |
| PB-08 | Pain 2 | As a stakeholder, I want to display 3D-printed board game products so that customers can discover available products. | Medium | The system can display products with basic information such as name, image, and description. |
| PB-09 | Pain 2 | As a customer, I want to view details of 3D-printed products so that I can decide whether I am interested in buying them. | Medium | Customers can open and view detailed information for each product. |
| PB-10 | Pain 2 | As a stakeholder, I want customers to see which 3D-printed products are available so that products can be promoted more effectively. | Low | Available products are clearly shown to customers in the system. |
| PB-11 | Pain 3 | As a customer, I want to join an existing checked-in group by scanning my NFC tag at the same table so that my friends and I share one session. | High | When a customer scans at a table with an active session, the system adds them to that group instead of creating a separate session. |
| PB-12 | Pain 3 | As a staff member, I want to check out one member of a group individually so that a customer who is leaving early can pay and go without ending the whole group's session. | High | Staff can select a single customer within a group and check them out; the remaining group members stay checked in. |
| PB-13 | Pain 3 | As a staff member, I want to check out an entire group at once so that I don't have to close each member's session individually when the whole table leaves together. | Medium | Staff can trigger a single check-out action that ends the session for every member of a group. |
| PB-14 | Pain 3 | As a staff member, I want the admin web view to show which table is currently being scanned and who is scanning so that I can confirm the right customer/group before charging. | High | The staff web UI highlights the active table and the specific member currently scanning during check-in/check-out. |
| PB-15 | Pain 3 | As a staff member, I want a backend user-management API so that staff accounts and customer NFC identities can be created, updated, and deactivated. | Medium | Staff can manage NFC identities and staff accounts through the backend API without direct database access. |

---

## Priority Summary

### High Priority
- NFC Check-in
- NFC Check-out
- Automatic session recording
- Active session monitoring
- Reliable operation during busy periods
- Group check-in (join an existing session)
- Individual check-out within a group
- Staff admin view of active table/scanning indicator

### Medium Priority
- Improve system usability
- Group check-out (whole group at once)
- Backend user-management API

### Low Priority
- Product availability / promotion support

---

## Traceability

| User Pain | Related Backlog Items |
|---|---|
| Pain 1 — Existing website is inconvenient | PB-06, PB-07 |
| Pain 2 — Need to promote and sell 3D-printed products | PB-08, PB-09, PB-10 |
| Pain 3 — Check-in/check-out requires staff assistance | PB-01, PB-02, PB-03, PB-04, PB-05, PB-11, PB-12, PB-13, PB-14, PB-15 |