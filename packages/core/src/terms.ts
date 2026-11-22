import type { CampusClient } from './api';

/**
 * The Terms & Conditions students and shops agree to. Raise TERMS_VERSION whenever the meaning
 * changes: everyone is then asked once more to agree (accept_terms records the version and time).
 */
export const TERMS_VERSION = 1;
export const TERMS_UPDATED = '22 November 2026';
export const SUPPORT_EMAIL = 'ronakdotasara05@gmail.com';
export const PRIVACY_POLICY_URL = 'https://sites.google.com/dotasaraagrotech.in/campus-cart-nith';

export type TermsSection = {
  title: string;
  /** Who it is mainly for, so the screen can mark it. */
  for: 'everyone' | 'students' | 'shops';
  points: string[];
};

/** The plain-words summary shown first, so nobody has to read the whole thing to know the deal. */
export const TERMS_SUMMARY: string[] = [
  'Campus Cart NITH connects you with shops on campus. The shop makes, packs and hands over your order, and you pay the shop directly.',
  'You see the full price, including any delivery and platform fee, before you place an order.',
  'Check your order when you receive it. If something is wrong, call the shop first; we will help if you can’t sort it out.',
  'Be fair to each other: real orders, real details, polite messages.',
];

export const TERMS: TermsSection[] = [
  {
    title: '1. About these terms',
    for: 'everyone',
    points: [
      'Campus Cart NITH (“Campus Cart”, “we”, “us”) is an app run by Ronak Dotasara for the NIT Hamirpur campus. It lets students order from shops on campus and lets those shops take and manage orders.',
      'These terms are an agreement between you and us. By ticking “I agree” or by using the app, you accept them. If you don’t agree, please don’t use the app.',
      'Our Privacy Policy explains what information we collect and why. It is part of these terms.',
      'We may update these terms as the app grows. When the change matters, the app will ask you to agree again before you continue.',
    ],
  },
  {
    title: '2. What Campus Cart is, and isn’t',
    for: 'everyone',
    points: [
      'Campus Cart is a platform. We are not a shop: we don’t make, stock, sell or own the food and goods you order.',
      'Each shop sets its own menu, prices, stock and opening times, and is responsible for the quality, quantity, hygiene, safety and legality of what it sells, including food safety (FSSAI) rules and any taxes.',
      'The contract to buy an item is between the student and the shop. We pass the order between you, show its progress, and help if something goes wrong.',
      'Photos and descriptions are a guide. What you get may look a little different.',
    ],
  },
  {
    title: '3. Your account',
    for: 'everyone',
    points: [
      'Students sign in with their own @nith.ac.in Google account. Shops sign in with the ID and password the Campus Cart team gives them.',
      'Keep your sign-in to yourself. You are responsible for what is done from your account; tell us at once if you think someone else has used it.',
      'Give correct details, especially your name and mobile number, so the shop can reach you about your order.',
      'If you are under 18, use the app with the permission of a parent or guardian.',
      'You can ask us to delete your account at any time (see the Privacy Policy). Records of past orders may be kept where the law or open bills need them.',
    ],
  },
  {
    title: '4. Placing an order',
    for: 'students',
    points: [
      'Before you place an order you see the items, the shop, the delivery or pickup choice, and the total, including any delivery fee and the platform fee. That total is what you pay.',
      'An order is confirmed only when the shop accepts it. A shop may reject an order, for example when it is closed, too busy, or out of stock. If it doesn’t respond within a few minutes, the order is dropped automatically. You pay nothing for a rejected or dropped order.',
      'If the shop runs out of some items, it may remove them and send the rest. The total is lowered for what was removed, fees never go up because of it, and you are told straight away.',
      'Times shown are estimates. Queues, weather and rush hours can make an order late.',
      'You can have up to 3 orders on the way at once.',
    ],
  },
  {
    title: '5. Paying',
    for: 'students',
    points: [
      'You pay the shop directly when you receive your order, in cash or by UPI to the shop’s own UPI ID. Campus Cart doesn’t take or hold your money.',
      'Pay only the total shown in the app. Don’t pay anyone who asks for more, and tell us if it happens.',
      'Fees: we charge a small platform fee on each order (₹4 at the time of writing), and orders below a set amount may carry a delivery charge. Both are always shown before you order. The shop collects them with your payment.',
    ],
  },
  {
    title: '6. Delivery and pickup',
    for: 'students',
    points: [
      'For delivery, pick the right drop point (hostel, department or campus spot) and keep your phone with you. Some hostels hand over at the reception only.',
      'Give the shop your 4-digit code (or your token number for pickup) only when you have your order in hand. That code confirms you received it.',
      'If you can’t be reached or don’t come to collect, the shop may cancel the order. Repeatedly ordering and not collecting can lead to your account being paused.',
    ],
  },
  {
    title: '7. Cancelling, problems and refunds',
    for: 'students',
    points: [
      'You can cancel an order until the shop accepts it. After that, only the shop can cancel it.',
      'Check your order before you pay. If an item is missing, wrong, spoilt or not as described, tell the shop right away; its number is on your order. The shop will replace the item, take it off the bill or refund what you paid for it.',
      'If you can’t sort it out with the shop, write to us at ' + SUPPORT_EMAIL + ' within 48 hours with your order code. We will look at the order record and help both sides reach a fair outcome.',
      'Because you pay the shop directly, any refund comes from the shop.',
    ],
  },
  {
    title: '8. Print Store, group orders and reviews',
    for: 'students',
    points: [
      'Print Store: upload only files you have the right to print. Don’t upload anything illegal, offensive or copied in a way that breaks copyright. Files are deleted automatically about a day after the order ends.',
      'Group orders: the person who starts a group order chooses the shop and the drop point and can cancel it while it is open. Each member pays for their own items.',
      'Ratings and reviews should be honest and about your own order. We may remove reviews that are abusive, false or not about the order.',
    ],
  },
  {
    title: '9. For shops: running your shop on Campus Cart',
    for: 'shops',
    points: [
      'Keep your menu, prices, stock and open/closed status correct. Students order on what the app shows.',
      'Accept or reject new orders quickly. Orders not answered within a few minutes are dropped automatically.',
      'If you can’t supply some items, remove them in the app before packing instead of sending something else without asking. Don’t charge more than the total shown in the app.',
      'Prepare and hand over orders safely and hygienically, and follow the law, including FSSAI food safety rules, licences and taxes (such as GST, if it applies to you). You are responsible for what you sell.',
      'Hand over only with the student’s code or token, so the order record stays correct.',
      'Use students’ names, numbers and drop points only to deliver their orders. Don’t share them or use them for anything else.',
      'Keep your shop IDs and passwords safe. You are responsible for what your owners and counter staff do in the app. Ask us to remove a login when someone leaves.',
      'Your UPI ID is set by the Campus Cart team so nobody can redirect your payments. Tell us when it changes.',
    ],
  },
  {
    title: '10. For shops: platform fee',
    for: 'shops',
    points: [
      'For each completed order you collect the platform fee shown on that order (₹4 per order at the time of writing) along with the student’s payment.',
      'At the start of each month we send you a bill for the platform fees of the last month’s completed orders. The app shows the same list of orders, so you can check it.',
      'Please pay the bill within 10 days. If a bill stays unpaid, we may close your shop on Campus Cart until it is settled.',
      'We will tell you at least 15 days before we change the platform fee.',
    ],
  },
  {
    title: '11. Fair use',
    for: 'everyone',
    points: [
      'Don’t place fake or prank orders, give false details, or order with no plan to collect.',
      'Don’t harass, abuse or threaten shop staff, students or our team, in the app, on calls or in person.',
      'Don’t try to break, overload, copy or get around the app, its security or its limits, or use it for anything illegal.',
      'We may pause or close an account that breaks these terms. Where we can, we will tell you why and give you a chance to explain.',
    ],
  },
  {
    title: '12. Our responsibility',
    for: 'everyone',
    points: [
      'We work hard to keep the app running, but it may sometimes be slow, unavailable or wrong. It is provided “as is”.',
      'We are not responsible for the items shops sell, for a shop’s or student’s actions, or for delays outside our control.',
      'As far as the law allows, our total responsibility for any claim about an order is limited to the platform fee paid on that order. Nothing in these terms takes away your rights under Indian consumer law.',
    ],
  },
  {
    title: '13. Complaints and contact',
    for: 'everyone',
    points: [
      'For anything about the app, write to ' + SUPPORT_EMAIL + '. You can also send ideas from Account → Suggestions.',
      'Grievance officer: Ronak Dotasara, ' + SUPPORT_EMAIL + '. We will acknowledge a complaint within 48 hours and try to resolve it within 30 days.',
      'These terms follow the laws of India. Any dispute that can’t be settled by talking it through will be heard by the courts at Hamirpur, Himachal Pradesh.',
    ],
  },
];

/** Records that the signed-in person agreed to this version of the terms. */
export async function acceptTerms(client: CampusClient, version = TERMS_VERSION): Promise<void> {
  const { error } = await client.rpc('accept_terms', { p_version: version });
  if (error) throw error;
}

/** The newest terms version this person agreed to (0 when they haven't yet). */
export async function myTermsVersion(client: CampusClient, userId: string): Promise<number> {
  const { data, error } = await client.from('profiles').select('terms_version').eq('id', userId).single();
  if (error) throw error;
  return data.terms_version;
}

/** Sends the CampusCart team an idea or a complaint from inside the app. */
export async function sendSuggestion(client: CampusClient, userId: string, body: string): Promise<void> {
  const { error } = await client.from('suggestions').insert({ profile_id: userId, body: body.trim() });
  if (error) throw error;
}

/** Admins only: suggestions, newest first, with who sent them. */
export async function listSuggestions(client: CampusClient) {
  const { data, error } = await client.rpc('list_suggestions', { p_limit: 200 });
  if (error) throw error;
  return data;
}

/** Admins only: marks suggestions as read. */
export async function markSuggestionsRead(client: CampusClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await client.from('suggestions').update({ read_at: new Date().toISOString() }).in('id', ids);
  if (error) throw error;
}
