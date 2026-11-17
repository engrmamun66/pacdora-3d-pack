# Client portal: shared templates, customers and orders

A **Client** is a signed-in user. Their saved templates (projects), with their own categories and tags, can be shared on
permanent public links. Anyone who opens a link can browse, add templates to a cart and send an order. The person who orders is
a **Customer**. No prices are shown anywhere (subscriptions come later).

## Addresses

| Page | Address |
| --- | --- |
| All templates | `/{user-hash}/templates` |
| One category or tag | `/{user-hash}/{link-hash}/templates` |
| One template | `/{user-hash}/templates/{template-hash}` or `/{user-hash}/{link-hash}/templates/{template-hash}` |
| Cart and order form | `/{user-hash}/cart` |
| Customer's orders | `/{user-hash}/orders` |
| Customer sign-in | `/{user-hash}/login` |

* The **user hash** is the hash of the Client's "all templates" link. Category and tag links have their own random hash
  (12 characters, table `share_link`, made when the Client opens the Share tab).
* A **template hash** is calculated from the project id and a server secret (`server/share-hash.ts`): permanent, no table needed.
* Every link has an **On / Off** switch (Dashboard > Share). Off shows "not available"; the address is kept and works again
  when switched on. A single template that is switched off is hidden from every page, including category and tag lists.
* Code: `server/portal.ts` (links and what a page may show), `app/(portal)/[userHash]/...` (pages), `components/portal/`.

## Customers sign in by SMS

* Phone number only (Bangladesh mobile numbers, `lib/phone.ts`). A 6-digit code is sent through **MiMSMS**
  (`server/sms.ts`); it is valid for 5 minutes, one code per minute, 5 per hour per number, 5 wrong tries per code.
* Customers are their own table (`customer`, `customer_otp`, `customer_session`) with their own cookie `customer_session`.
  They are not better-auth users and cannot open Client pages.
* Orders (`order`, `order_item`) belong to the Client whose portal was used. Contact details (name, country, district, address)
  are copied onto the order and remembered on the customer for next time.

### Environment (`apps/web/.env.local`, never committed)

```
MIMSMS_USERNAME="account email"
MIMSMS_API_KEY="..."
MIMSMS_SENDER_NAME="sender number or name"
MIMSMS_DEV_PASS="999000"
```

`MIMSMS_DEV_PASS` is a development shortcut. **When it is set, every sign-in code is that value and no SMS is sent.** When it is
empty or missing, a random code is sent by SMS. Leave it empty in production. (`MIMSMSM_DEV_PASS` is read as the same setting.)

## Client dashboard (`/my-dashboard`)

Overview (new orders, shop link, recent orders) · My templates · Orders (filter by status, search, order page with status
buttons, customer contact, print) · Share (links with copy, open and On / Off) · Profile settings.

## QR codes and branding

- **QR code** (Share tab, and the link icons on My templates): every share link has a QR code button. It opens a window with the code, the Client's logo and business name, and can **Print** (a clean A4 sheet), **Download** (PNG) or copy the link. The code is made in the browser with the `qrcode` package. A link that is switched off still gets a code, with a note to turn it on first.
- **Branding** (Profile settings tab): the Client uploads a logo (PNG or JPEG, 2 MB, stored with the other files under `<userId>/logo-<uuid>.<ext>`; columns `businessLogoKey` and `businessLogoMime` on `user`). The business name is the existing *Business name* field (the Client's own name is used when it is empty). Both show in the header of every shared page, the browser tab title of the portal is the business name alone, and both are printed on the QR sheet.
- The logo is public at `/api/portal/logo/{user-hash}` (only the logo, nothing else of the account); it is set and removed through `/api/profile/logo`.
