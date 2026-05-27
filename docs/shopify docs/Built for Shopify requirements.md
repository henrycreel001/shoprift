---
title: Built for Shopify requirements
description: >-
  Review a listing of all of the app requirements that need to be met to be
  eligible for the Built for Shopify program.
source_url:
  html: 'https://shopify.dev/docs/apps/launch/built-for-shopify/requirements'
  md: 'https://shopify.dev/docs/apps/launch/built-for-shopify/requirements.md'
---

# Built for Shopify requirements

To qualify for Built for Shopify status, your app must meet the requirements listed below. Each requirement in this list helps your app meet our app quality standards. Some requirements are general and apply to all apps, and others apply to [specific categories of apps](#category-specific).

Along the way, you'll qualify for smaller achievements that grant you unique benefits. For details about the benefits of each achievement, refer to the [Built for Shopify overview](https://shopify.dev/docs/apps/launch/built-for-shopify#other-achievements).

**Changelog:**

For details about changes to the Built for Shopify requirements, refer to the [Built for Shopify changelog](https://shopify.dev/changelog?filter=built_for_shopify).

## 1. Prerequisites

Some prerequisites are automatically evaluated while others require manual validation. Visit your app's **Distribution** page in your [Partner Dashboard](https://www.shopify.com/partners) for a comprehensive breakdown.

#### 1.1 General

#### 1.1.1 Meet App Store requirements

The app needs to continue to meet the [requirements for distributing apps on the Shopify App Store](https://shopify.dev/docs/apps/launch/app-requirements-checklist).

Your app will be audited for these requirements when you apply for Built for Shopify status.

#### 1.1.2 Have a good Partner standing

The app needs to comply with the [Partner Program Agreement](https://www.shopify.com/partners/terms) and [Shopify API License and Terms of Use](https://www.shopify.com/legal/api-terms). Your Partner Account must have no active or outstanding infractions. Resolving an outstanding infraction is the first step in getting your account back into Good Partner standing, however, even after resolving issues, previous violations can still temporarily impact your BFS status depending on their severity and frequency. Read more about [Enforcement of Shopify's Partner Program Policies](https://help.shopify.com/en/partners/faq/removal).

#### 1.2 Merchant utility

#### 1.2.1 Have a minimum number of installs

Your app must have a minimum of 50 net installs from active shops on paid plans.

#### 1.2.2 Have a minimum number of reviews

Your app must have a minimum of five reviews.

#### 1.2.3 Have a minimum app rating

Your app must meet a minimum recent app rating threshold in the Shopify App Store.

## 2. Performance

[Optimizing your app for performance](https://shopify.dev/docs/apps/build/performance) directly influences conversion rates, repeat business, and search engine rankings.

#### 2.1 Admin performance

Shopify uses [Web Vitals](https://web.dev/articles/vitals) to determine the performance of your app in the Shopify admin. To enable Shopify to gather Web Vitals metrics, your app needs to use the [latest version of App Bridge](https://shopify.dev/docs/api/app-bridge-library#getting-started).

Learn how to measure your app's performance in the Shopify admin using [Web Vitals](https://shopify.dev/docs/apps/build/performance/admin-installation-oauth#improve-your-apps-loading-performance)

When your app loads in the Shopify admin, it needs to meet Web Vitals targets for the following metrics, at the 75th percentile of page loads:

#### 2.1.1 Minimize Largest Contentful Paint (LCP)

Your app's [Largest Contentful Paint (LCP)](https://shopify.dev/docs/apps/build/performance/admin-installation-oauth#largest-contentful-paint) is 2.5 seconds or less. Your app needs to have a minimum of 100 calls for LCP over the last 28 days to be assessed.

#### 2.1.2 Minimize Cumulative Layout Shift (CLS)

Your app's [Cumulative Layout Shift (CLS)](https://shopify.dev/docs/apps/build/performance/admin-installation-oauth#cumulative-layout-shift) is 0.1 or less. Your app needs to have a minimum of 100 calls for CLS over the last 28 days to be assessed.

#### 2.1.3 Minimize Interaction to Next Paint (INP)

Your app's [Interaction to Next Paint (INP)](https://shopify.dev/docs/apps/build/performance/admin-installation-oauth#interaction-to-next-paint) is 200 milliseconds or less. Your app needs to have a minimum of 100 calls for INP over the last 28 days to be assessed.

#### 2.2 Storefront performance

#### 2.2.1 Minimize the impact on store speed

Your app must not reduce the storefront Lighthouse performance score by more than ten points.

#### 2.3 Checkout performance

#### 2.3.1 Minimize the impact on checkout speed

You need to [optimize how your app fetches and stores carrier rates](https://shopify.dev/docs/apps/build/performance/checkout) to minimize impact on checkout speed.

For Shopify to assess your impact on checkout speed, your app must make a minimum of 1000 requests over the last 28 days.

Your requests must have a p95 value of 500ms or less, with a 0.1% failure rate.

## 3. Integration

Design your app so that all of its primary functionality is available within the Shopify admin. [Integrating your app into the Shopify admin](https://shopify.dev/docs/apps/build/integrating-with-shopify) makes it feel familiar, gives you access to Shopify UI elements, and lets users use it easily on mobile devices.

#### 3.1 Embedded apps

#### 3.1.1 Embed the app in the Shopify admin

Apps should be embedded in the Shopify admin using the latest version of [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge) by adding the `app-bridge.js` script tag to the `<head>` of every document of your app. Use [session token authentication](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens) to further optimize the merchant's experience.

Embedding your app in the Shopify admin makes your app feel familiar, gives you access to Shopify UI elements, and lets merchants use your app more easily on mobile devices.

Apps should not embed external web pages. For example, an app named Puzzlify should not have an embedded [app home](https://shopify.dev/docs/apps/build/admin#app-home) that looks identical to the puzzlify.com website.

#### 3.1.2 Keep primary app workflows within Shopify

By default, apps should be embedded in the Shopify admin with the latest version of [App Bridge](https://shopify.dev/docs/api/app-bridge). Merchants should be able to complete primary app workflows inside the Shopify admin. Merchants shouldn't need to access an external website or external surface to complete a primary workflow.

[Exceptions](https://shopify.dev/docs/apps/build/integrating-with-shopify#exceptions) apply on apps that need a standalone site to provide more complex features in a user-friendly way. An example is messaging apps, where users need to continuously monitor their conversation inbox, while accessing other areas of the Shopify admin.

#### 3.1.3 Enable seamless sign up based on Shopify credentials

Apps should make sign up seamless for merchants, without requiring an additional login or sign-up prompt. Users should be able to start using the app immediately after installing it, without having to complete another sign up.

[Exceptions](https://shopify.dev/docs/apps/build/integrating-with-shopify#exceptions) apply on apps that can't be easily accessed by merchants in a self-service manner and require a more complex sign-up, which often involves a business-to-business contract.

In these cases, the app's onboarding in the Shopify admin must first ask merchants to connect their store to their existing credentials. If your app offers both self-service and business-to-business sign up, then the onboarding must include an option to sign up for the service using the merchant's existing Shopify credentials.

#### 3.1.4 Include simplified monitoring or reporting

Expose key metrics that are helpful for merchants on the app's home page. If your app includes monitoring or complex reports that can only exist on an external website or app surface, then you must include a simplified version of the monitoring or reporting in the Shopify admin.

#### 3.1.5 Keep third-party connection settings within Shopify

Any settings or configurations that control the connection between Shopify and a third-party system must be available inside the Shopify embedded app interface.

For instance, when merchants link a social media account, they should have the ability to connect and disconnect it through the Shopify admin at any time.

#### 3.2 Installation and asset management

#### 3.2.1 Provide a clean uninstallation process

If your app is meant to be used in a merchant's online store, then you need to use [theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions) to build the elements to be included in the theme.

Theme app extensions allow apps to integrate with themes seamlessly, without injecting code into the theme. When merchants uninstall apps, blocks that are associated with the apps are automatically and entirely removed from online store themes.

#### 3.2.2 Doesn't use the Asset API to create, modify, or delete files

Your app shouldn't add, remove, or edit a merchant's theme files. There are three exceptions to this rule:

* Your app is a page builder app that adds or replaces all layouts or templates files with the purpose of providing an alternative theme customization experience.
* Your app backs up all theme files, and restores files from a backup.
* Your app primarily provides search engine optimization, content locking, or developer tooling functionality. You can still use the [Asset API](https://shopify.dev/docs/apps/build/online-store/asset-legacy) to read theme files.

Your app will be audited for Asset API usage when you apply for Built for Shopify status.

## 4. Design

The design of your app should not result in merchants feeling confused, stressed, or misled. Instead, your app should be designed to feel [familiar](#familiar), [helpful](#helpful), and [user-friendly](#user-friendly).

#### 4.1 Familiar

Your app generally looks and behaves like the Shopify admin. It offers merchants a predictable and familiar experience. Your app should leverage Shopify [App Bridge](https://shopify.dev/docs/api/app-bridge) where appropriate.

#### 4.1.1 Follow UX best practices

Your app's UI should mimic Shopify's core look and feel to ensure merchants experience a consistent and familiar environment.

![An annotated app home page with callouts for admin button styles, consistent spacing and most content is in a card](https://shopify.dev/images/apps/bfs-requirements/follow-ux-best-practices.png)

Show reasons for rejection

1. UI is generally buggy and/or unpolished. For example, content flickers, repeatedly loads in/out, or causes other content on the page to excessively shift around.
2. The majority of content does not reside in card-like containers where the container looks similar to the Shopify admin cards.
3. Button styles do not match the Shopify admin. For example, primary buttons are a completely different color than Polaris, such as green or purple.
4. A serif or script font is used for the majority of content.
5. Body text size is significantly different from the text size used throughout the Shopify admin.
6. An app's background color is significantly different from the Shopify admin. For example, an app has a black background.
7. Interacting with tabs in a tab group modifies content above the tabs.
8. In a group or list, some items feature icons while others do not.
9. An app's layout spacing is significantly different from the spacing used throughout the Shopify admin.
10. An app's text does not meet basic [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/?showtechniques=141#contrast-minimum) contrast requirements.
11. A sub-page of an app does not offer a back button to the parent page.

#### 4.1.2 Mobile-friendly

Design your app to be responsive and adapt to different screen sizes and devices.

![A responsive app on a desktop and mobile device.](https://shopify.dev/images/apps/bfs-requirements/mobile-friendly.png)

Show reasons for rejection

1. On a mobile device, an entire page requires horizontal scrolling.
2. On a mobile device, some content is entirely inaccessible. For example, content is collapsed with no mechanism to expand, or content does not wrap and has no mechanism to scroll horizontally to reveal the obscured portions.
3. On a mobile device, some content appears unreasonably condensed. For example, a two column layout on a desktop device, remains as a two-column layout on a mobile device rather than the two columns stacking.

#### 4.1.3 Concise app name

App names in the admin should not truncate in the Shopify navigation menu.

![The app name, which reads "Puzzlify" and is entirely visible.](https://shopify.dev/images/apps/bfs-requirements/concise-app-name.png)

Show reasons for rejection

1. On a desktop device, when pinned (i.e. the pin icon is no longer visible), the app name is truncated with ellipsis in the Shopify navigation menu.

#### 4.1.4 Use the nav menu

Use the App Bridge [s-app-nav](https://shopify.dev/docs/api/app-home/app-bridge-web-components/s-app-nav) to integrate your app's primary navigation into the Shopify admin navigation menu.

![An app nav with concisely-labeled items like "Templates", "Photos", "Puzzles", and "Examples".](https://shopify.dev/images/apps/bfs-requirements/use-the-nav-menu.png)

Show reasons for rejection

1. An app has its own navigation menu instead of using the Shopify admin navigation menu.
2. Navigating to a sub-page fails to highlight the relevant parent navigation item. For example, navigating to the "Puzzles" sub-page of the "Templates" navigation item does not highlight the "Templates" navigation item.
3. An app has a separate navigation item in addition to the app name that redirects to the app's homepage. Instead, the app name should point at the app's homepage. This is controlled in the Partner Dashboard, under Configuration > URLs > App URL.
4. An app renders emojis within the Shopify admin navigation menu.

#### 4.1.5 Use the contextual save bar

Form inputs should generally be saved using the App Bridge [Contextual Save Bar](https://shopify.dev/docs/api/app-home/apis/save-bar) (CSB).

![The contextual save bar visible at the top of the page. The bar indicates that there are unsaved changes, and includes buttons to discard or save changes.](https://shopify.dev/images/apps/bfs-requirements/use-the-contextual-save-bar.png)

Show reasons for rejection

1. A form does not integrate with the CSB when it would be reasonable to do so. For example, an editor to customize a theme announcement bar has its own save button, but fails to integrate with the CSB.
2. When the CSB is present, a merchant is able to navigate away from the corresponding form without first being forced to interact with the CSB's "Save" or "Discard" buttons.

#### 4.1.6 Use modals appropriately

In a [s-modal](https://shopify.dev/docs/api/app-home/polaris-web-components/overlays/modal), use the [heading](https://shopify.dev/docs/api/app-home/polaris-web-components/overlays/modal#properties-propertydetail-heading) attribute to display the modal's title and the [primary-action](https://shopify.dev/docs/api/app-home/polaris-web-components/overlays/modal#slots-propertydetail-primaryaction) and [secondary-actions](https://shopify.dev/docs/api/app-home/polaris-web-components/overlays/modal#slots-propertydetail-secondaryactions) slots to display the modal's call-to-action buttons.

![A modal header with a secondary button labeled "Change puzzle template" and a primary button labeled "Save".](https://shopify.dev/images/apps/bfs-requirements/use-modals-appropriately.png)

Show reasons for rejection

1. In a [s-modal](https://shopify.dev/docs/api/app-home/polaris-web-components/overlays/modal), the primary and/or secondary modal action buttons appear somewhere other than within the component [slots](https://shopify.dev/docs/api/app-home/polaris-web-components/overlays/modal#slots).
2. A modal uses the deprecated [Polaris Fullscreen bar component](https://polaris-react.shopify.com/components/deprecated/fullscreen-bar) instead of the [s-app-window](https://shopify.dev/docs/api/app-home/app-bridge-web-components/app-window) and [s-page](https://shopify.dev/docs/api/app-home/app-bridge-web-components/title-bar) components.

#### 4.2 Helpful

Your app generally works well and is easy to use. The steps required to set up and implement your app's core workflow should be clear and easy to follow. The process should be free of errors and bugs. If error messages are necessary, they should be clear and the method to rectify any errors should be obvious.

#### 4.2.1 Spelling, grammar and phrasing

Apps must use clear and easy to understand language, proper grammar, and proper spelling throughout.

![The Polaris grammar and mechanics page, which explain guidelines for using special characters, dates, numbers, and measurements.](https://shopify.dev/images/apps/bfs-requirements/spelling-grammar-and-phrasing.png)

Show reasons for rejection

1. One or more prominent spelling or grammatical errors (even if the meaning can still easily be inferred), where "prominent" refers to copy within headings, navigation items or calls to action (e.g. button labels).
2. Phrases, headings, labels or calls to action that are difficult to understand and/or lack sufficient context. For example, a text input with the label "Time" with no explanation of what unit of time is expected.

#### 4.2.2 Helpful onboarding

Apps should have a concise onboarding experience that helps merchants establish the app's core functionality.

![Onboarding screen welcoming merchants to the Puzzlify editor, with onboarding steps presented in separate, dismissible cards. Each card has a title, body text, and a button that merchants can click to complete the onboarding step.](https://shopify.dev/images/apps/bfs-requirements/helpful-onboarding.png)

Show reasons for rejection

1. An app's onboarding does not sufficiently guide merchants to completion.
2. An app's onboarding is not concise.
3. An app's onboarding is difficult to locate, for example, onboarding is collapsed or appears out of view.
4. It is implied or strongly suggested that installing an additional app is a required onboarding step. For example, a setup guide that features a primary button to install another app.
5. An app asks for merchant information without providing clear justification. For example, asking "What types of products do you sell" without any supporting copy, such as, "We'll use this information to automatically recommend appropriate templates".
6. After onboarding has been completed, there is no mechanism to remove UI related to onboarding.

#### 4.2.3 Helpful homepage

Your homepage should clearly indicate if the app is set up and working, and, if possible, indicate how well the app is performing.

![An app home page with a dismissible informational banner in blue about USPS rate changes, and another app home page with a section titled "This week's puzzle performance", with two graphs.](https://shopify.dev/images/apps/bfs-requirements/helpful-homepage.png)

Show reasons for rejection

1. An app has an app block and/or app embed to be activated in a theme but fails to communicate the corresponding status(es) on the app's homepage using [app.extensions()](https://shopify.dev/docs/api/app-home/apis/app#extensions).
2. An app fails to include any metrics or analytics on the homepage when there are obvious metrics that would be helpful to merchants. For example, an email marketing app fails to display metrics related to open rates, engagement rates and/or recent campaigns.
3. After dismissing any and all dismissible elements, an app's homepage only contains static content. For example, a homepage only displays links to other parts of the app or a static welcome message.

#### 4.2.4 Helpful error messages

Errors should be red, guide merchants to solutions, and appear next to relevant fields when possible.

![A form field filled with an email address that currently has a typo. An error message that explains the specific issue displays underneath the form.](https://shopify.dev/images/apps/bfs-requirements/helpful-error-messages.png)

Show reasons for rejection

1. An error message automatically disappears from view after a set amount of time has elapsed. For example, an error message is displayed in a toast, which automatically disappears after 5 seconds.
2. An error message appears in a color other than red.
3. A field is highlighted in red but does not have a corresponding error message.
4. A contextual error is not displayed contextually. For example, a "Must be a valid email address" error is displayed at the top of the page rather than directly below the relevant form field.
5. One or more form fields display an error prior to any merchant interaction.

#### 4.2.5 Guide merchants to logical actions

When presenting a group of related actions, the most logical action should appear visually dominant.

![A dialog box that reads "Your template has unsaved changes. Changes will be lost if you leave without saving". There's a primary button that's labeled "Save Changes" and a secondary button that's labeled "Leave without saving".](https://shopify.dev/images/apps/bfs-requirements/guide-merchants-to-logical-actions.png)

Show reasons for rejection

1. In a button group with related actions, all buttons are presented with the same visual treatment. For example, a button group contains two secondary buttons labelled "Save changes" and "Leave without saving".
2. In a button group, the most visually prominent button doesn't represent the most logical next action. For example, in a button group with "Save changes" and "Leave without saving", the "Leave without saving" button is more visually prominent.

#### 4.2.6 Visible previews

If an app allows merchants to customize something visual, merchants must be able to see their changes in real-time.

![A two column layout with a preview and corresponding editor form fields.](https://shopify.dev/images/apps/bfs-requirements/visible-previews.png)

Show reasons for rejection

1. An app allows merchants to customize something visual but fails to provide a live-preview.
2. On a desktop device, a merchant cannot simultaneously view editor controls and the corresponding preview. For example, a merchant must toggle between the editor and preview, or a merchant must scroll up/down to toggle between viewing the editor and preview.

#### 4.3 User-friendly

Your app doesn't mislead, pressure or overwhelm merchants. Your app should not implement [dark patterns](https://en.wikipedia.org/wiki/Dark_pattern). Deceptive or manipulative practices erode merchant trust in your app and in Shopify.

#### 4.3.1 Don't make false claims

Don't guarantee, promise, or strongly suggest merchant outcomes.

![A dismissible warning banner in yellow that reads "Double your revenue by switching to Puzzlify Pro now". The banner includes a button that's labeled "Upgrade to Pro".](https://shopify.dev/images/apps/bfs-requirements/dont-make-false-claims.png)

Show reasons for rejection

1. An app includes language that states a merchant outcome. For example, "Upgrade to the Pro plan to increase your sales by 18%".
2. An app displays a promotion of another app which includes an average star rating of 4.5 stars. However, in the app store, the promoted app actually has a significantly different average rating of only 3 stars.

#### 4.3.2 Don't pressure merchants

Don't pressure merchants with visible timers, language that could cause guilt or shame, or offer rewards for 5-star reviews.

![A dismissible informational banner in blue, with a message notifying merchants that they have three days left to unlock a pro version of the app if they leave a 5-star review in the app store. The banner includes a button that's labeled "Leave a 5-star review".](https://shopify.dev/images/apps/bfs-requirements/dont-pressure-merchants.png)

Show reasons for rejection

1. An app offers a 7-day free trial. The app displays an animated countdown timer and encourages merchants to upgrade to a paid plan.
2. An app features calls to action that could reasonably make a merchant feel guilt or shame. For example, forcing merchants to click a button labelled "No thanks, I prefer less sales" to sign-up for a lower-tier plan.

#### 4.3.3 Don't distract merchants

Don't distract merchants with unnecessary animations, modals, popovers, or colors.

![A series of separate pages that all contain the same marketing message.](https://shopify.dev/images/apps/bfs-requirements/dont-distract-merchants.png)

Show reasons for rejection

1. A modal or popover automatically appears on page load, after a set time has elapsed, or as a result of an unrelated merchant action. For example, a “Get started” or “Live chat” popover appears on page load, or a “Leave us a review” modal appears after three seconds has elapsed.
2. A large element like a banner or card dramatically animates into view on page load, after a set time has elapsed, or as a result of an unrelated merchant action.
3. Animation is used to draw attention and is unrelated to a merchant action. For example, an "Upgrade to Pro" button wiggles.
4. Red is used for a purpose unrelated to error messaging or a destructive action.

#### 4.3.4 Don't overwhelm merchants

Don't overwhelm merchants with poorly organized forms, overwhelming amounts of text, or multiple banners.

![A card with a very long paragraph of text.](https://shopify.dev/images/apps/bfs-requirements/dont-overwhelm-merchants.png)

Show reasons for rejection

1. A single large and complex form is presented to merchants, rather than a form with fields subdivided into logical groupings.
2. Two or more banners appear in close proximity to one another. For example, at the top of a page or within a single card.
3. An app prominently features large amounts of text (i.e. multiple paragraphs), rather than concise and easily scannable copy. For example, an app displays a card with two paragraphs of text on the app homepage to welcome merchants.

#### 4.3.5 Don't impersonate Shopify

Don't do anything that might reasonably lead a merchant to mistake your app (or a feature of your app) for a [first-party Shopify app](https://apps.shopify.com/partners/shopify) or for Shopify itself.

![An icon that uses the Shopify logo for the app's branding.](https://shopify.dev/images/apps/bfs-requirements/dont-impersonate-shopify.png)

Show reasons for rejection

1. An app's icon could reasonably be mistaken for a [first-party Shopify app](https://apps.shopify.com/partners/shopify) icon. For example, an app icon features a striking similar gradient background to a first-party Shopify app icon.
2. An app uses the [Shopify Sidekick icon](https://www.shopify.com/ca/magic) and/or a color similar to [Shopify's magic purple color](https://polaris.shopify.com/tokens/color#color-bg-fill-magic) to denote an AI related feature.

#### 4.3.6 Dismissible ads

Advertisements and/or promotional content must be dismissible by merchants.

![A promotional message with the "X" icon for dismissing the screen highlighted in the upper right corner.](https://shopify.dev/images/apps/bfs-requirements/dismissible-ads.png)

Show reasons for rejection

1. Promotional content is not dismissible.
2. Promotional content is dismissible, however, after being dismissed the same (or similar) content later appears again.

#### 4.3.7 Label and disable premium features

Features that are gated by a particular plan, must be disabled (both visually and functionally) and clearly indicated. Features exclusive to [Shopify Plus](https://www.shopify.com/ca/plus) must be hidden for non-Plus merchants.

![Greyed out paid-tier features with a link to upgrade to a paid or premium plan. The page includes a button that's labeled "Preview".](https://shopify.dev/images/apps/bfs-requirements/label-and-disable-premium-features.png)

Show reasons for rejection

1. A plan-gated feature is interactive and appears visually enabled. It is only later revealed (e.g. upon form submission) that the feature actually requires merchants to pay for a more expensive plan.
2. A plan-gated feature is interactive but visually appears disabled.
3. A plan-gated feature is non-interative but visually appears enabled.
4. A feature that is exclusive to [Shopify Plus](https://www.shopify.com/ca/plus) merchants is visible to non-Plus merchants.
5. When an app offers multiple tiers and it is not obvious which specific tier is required to unlock a specific feature.

## 5. Category-specific

Not all apps are the same. A great app for one workflow uses different APIs, has different extensions, and looks different from an app for another workflow. Category-specific requirements ensure that apps excel in meeting unique user needs.

If your app belongs to one of the categories listed below, then it must meet all of the criteria listed for that category.

#### 5.1 Ads apps

Any app that enables merchants to create and manage digital advertising campaigns to promote their stores and products.

#### 5.1.1 Use web pixels for ads apps

If your app provides ad attribution, audience creation, segmentation, analytics, pixels, retargeting, or lookalike targeting, it must create and use [Web Pixel extensions](https://shopify.dev/docs/apps/build/marketing-analytics/build-web-pixels) to subscribe to relevant events emitted by Shopify when needed. You may not use script tags or require merchants to copy JavaScript into their stores in order to gather this data.

#### 5.1.2 Use Shopify segments for ads apps

Your app must allow merchants to use any segment defined in the Shopify admin when targeting advertisements or any other operation that targets multiple customers. It must also make these actions available through a [customer segment action extension](https://shopify.dev/docs/apps/build/marketing-analytics/customer-segments/build-an-action-extension).

#### 5.2 Affiliate program apps

Any app that enables merchants to create and manage systems for influencers to promote their products for commissions.

#### 5.2.1 Use web pixels for affiliate program apps

Your app must create and use [Web Pixel extensions](https://shopify.dev/docs/apps/build/marketing-analytics/build-web-pixels) to subscribe to relevant events emitted by Shopify when needed. You may not use script tags or require merchants to copy JavaScript into their stores in order to gather this data.

#### 5.3 Analytics apps

Any app that provides merchants with data-driven insights about their store's performance.

#### 5.3.1 Use web pixels for analytics apps

Your app must create and use [Web Pixel extensions](https://shopify.dev/docs/apps/build/marketing-analytics/build-web-pixels) to subscribe to relevant events emitted by Shopify when needed. You may not use script tags or require merchants to copy JavaScript into their stores in order to gather this data.

#### 5.4 Carrier services apps

Any app that connects to a [carrier service](https://shopify.dev/docs/api/admin-graphql/latest/queries/carrierService) (also known as a carrier calculated service or shipping service) to provide real-time shipping rates to buyers. [Learn more](https://shopify.dev/docs/apps/build/performance/checkout#limit-calls-to-retrieve-carrier-rates) about how to optimize your app's carrier rates performance. To assess your app's performance, you must make a minimum of 1000 requests in the last 28 days.

#### 5.4.1 Respond quickly to rate requests

Over the last 28 days, the carrier rate endpoint provided by your app must respond in fewer than 500 milliseconds for 95% of calls.

#### 5.4.2 Complete rate requests reliably

Over the last 28 days, the carrier rate endpoint provided by your app must successfully respond to 99.9% of requests.

#### 5.5 Discount apps

Any app that enables merchants to define and configure price reductions.

#### 5.5.1 Use discount primitives

Your app must either use [discount functions](https://shopify.dev/docs/apps/build/discounts#build-with-shopify-functions) to define custom discount types or use the native [discount APIs](https://shopify.dev/docs/apps/build/discounts#build-with-the-graphql-admin-api) to create discounts.

#### 5.5.2 Don't use draft orders with custom discounts

Your app must not create draft orders to give custom discounts. Drafts with custom discounts are designed for one-off merchant-driven flows rather than automated customer-driven flows and do not have the same reporting tools.

#### 5.5.3 Use a single redeem code per discount

Your app must use the [`discountRedeemCodeBulkAdd`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountRedeemCodeBulkAdd) mutation to create any discounts with multiple redeem codes.

Instead of creating separate discounts with the same value and different codes through the GraphQL Admin API, using [`discountRedeemCodeBulkAdd`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountRedeemCodeBulkAdd) ensures that all codes are linked to the same discount characteristics, making it easier to manage and update them as needed.

#### 5.5.4 Create high quality links

All [links to your app](https://shopify.dev/docs/apps/build/functions/input-output/metafields-for-input-queries#creating-your-merchant-interface) from the Create discount button on the Discounts page must direct to a page in your embedded app where merchants can create the corresponding discount. These pages must follow all relevant [App Design Guidelines](https://shopify.dev/docs/apps/design).

#### 5.6 Email marketing apps

Any app that enables merchants to communicate with customers via targeted email campaigns.

#### 5.6.1 Use web pixels for email marketing apps

If your app provides automation, segmentation, analytics, or pixels, it must create and use [Web Pixel extensions](https://shopify.dev/docs/apps/build/marketing-analytics/build-web-pixels) to subscribe to relevant events emitted by Shopify when needed. You may not use script tags or require merchants to copy JavaScript into their stores in order to gather this data.

#### 5.6.2 Sync customer data for email marketing apps

Your app must sync all [customer](https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerCreate) information to and from Shopify as required by the [Shopify API License and Terms of Use](https://www.shopify.com/legal/api-terms#2-using-the-shopify-a-p-i).

#### 5.6.3 Use Shopify segments for email marketing apps

Your app must allow merchants to use any segment defined in the Shopify admin when targeting advertisements or any other operation that targets multiple customers. It must also make these actions available through a [customer segment action extension](https://shopify.dev/docs/apps/build/marketing-analytics/customer-segments/build-an-action-extension).

#### 5.6.4 Help merchants to identify visitors to their store for email marketing apps

Your app must use the [visitors API](https://shopify.dev/docs/api/web-pixels-api/emitting-data#visitor-api) to log identifying information, such as emails or phone numbers, for any customers that provide this information on the Online Store.

#### 5.7 Forms apps

Any app that enables merchants to create custom fields for customers to submit personal information, preferences, or inquiries on their stores.

#### 5.7.1 Use Shopify segments for forms apps

Your app must allow merchants to use any segment defined in the Shopify admin when targeting advertisements or any other operation that targets multiple customers. It must also make these actions available through a [customer segment action extension](https://shopify.dev/docs/apps/build/marketing-analytics/customer-segments/build-an-action-extension).

#### 5.7.2 Help merchants to identify visitors to their store for forms apps

Your app must use the [visitors API](https://shopify.dev/docs/api/web-pixels-api/emitting-data#visitor-api) to log identifying information, such as emails or phone numbers, for any customers that provide this information on the Online Store.

#### 5.7.3 Sync customer data for forms apps

Your app must sync all [customer](https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerCreate) information to and from Shopify as required by the [Shopify API License and Terms of Use](https://www.shopify.com/legal/api-terms?shpxid=ac3fdf09-06C8-4EDF-2E7D-89B9F4124FC3#2-using-the-shopify-a-p-i).

#### 5.8 Fulfillment services apps

Any app that uses its own location to prepare and ship orders on behalf of merchants.

#### 5.8.1 Actively fulfill orders

Your app must be active and have fulfilled 100 or more [fulfillment orders](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder) in the last 28 days. If an app is not active, then it's not possible to accurately assess the other criteria for fulfillment services apps.

#### 5.8.2 Complete fulfillment orders

Your app must have completed 99% of the [fulfillment orders](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder) assigned to it in the last 28 days. New fulfillment orders that were created in the last 7 days are excluded. A fulfillment order is considered incomplete if it's in one of the following states:

* `open`, `submitted`
* `in_progress`, `accepted`
* `in_progress`, `rejected`
* `in_progress`, `cancellation_rejected`
* `in_progress`, `cancellation_requested`

#### 5.8.3 Respond to callback requests

In the last 28 days, your app must have responded successfully to 99% of Shopify [callback requests](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentService) that are sent to it, so merchants are not alerted to failing callback requests.

#### 5.8.4 Wait for merchant requests

Your app must only fulfill fulfillment orders after a [merchant requests](https://shopify.dev/docs/api/admin-graphql/latest/enums/FulfillmentOrderStatus) fulfillment.

#### 5.8.5 Add tracking information

In the last 28 days, your app must have [added tracking information](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentTrackingInfoUpdateV2) to 80% of the fulfillments that it creates within one hour of creation.

In cases where precise tracking information isn't available from a shipping carrier URL, you can provide a custom URL to your app's site by:

* Using [`fulfillmentCreateV2`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreateV2) to populate `fulfillment.trackingInfo.company` and `fulfillment.trackingInfo.url(s)` at the time of creation, OR
* Using [`fulfillmentTrackingInfoUpdateV2`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentTrackingInfoUpdateV2) to mutate an existing entry and populate `trackinigInfoInput.company` and `trackingInfoInput.url(s)`.

#### 5.8.6 Respond to fulfillment requests

In the last 28 days, your app must have responded to 99% of fulfillment requests within four hours by either [accepting](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentOrderAcceptFulfillmentRequest) or [rejecting](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentOrderRejectFulfillmentRequest) the fulfillment request.

#### 5.8.7 Respond to cancellation requests

In the last 28 days, your app must have responded to 99% of cancellation requests within 1 hour by either [accepting](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentOrderAcceptCancellationRequest) or [rejecting](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentOrderRejectCancellationRequest) the cancellation request.

#### 5.9 Invoices and receipts apps

Any app that generates invoices or packing slips for orders.

#### 5.9.1 Enable printing on orders pages

Your app must use an [admin print action extension](https://shopify.dev/docs/apps/build/admin/actions-blocks) to let merchants print invoices or packing slips for an individual order directly from the orders detail page as well as for any selected orders from the orders index page.

#### 5.10 Product bundles apps

Any app that groups products together to be sold as a single unit.

#### 5.10.1 Use bundles primitives

Your app must either use the GraphQL Admin API to create [static bundles](https://shopify.dev/docs/apps/build/product-merchandising/bundles/add-fixed-bundle) or use a `cartTransform` function to create [customized bundles](https://shopify.dev/docs/apps/build/product-merchandising/bundles/add-customized-bundle).

However, if your app supports a bundles use case that is not yet supported through these APIs — such as selling bundles on unsupported sales channels, selling bundles as a part of a subscription, or editing orders to add or remove bundles after purchase — you may use other methods to create a bundle.

#### 5.11 Product reviews apps

Any app that enables merchants to collect product reviews.

#### 5.11.1 Provide a flow trigger

Your app must provide a [Flow trigger](https://shopify.dev/docs/apps/build/flow/triggers/create) that starts a workflow whenever a new review is collected.

#### 5.11.2 Use block extensions

Your app must provide an [admin block extension](https://shopify.dev/docs/apps/build/admin/actions-blocks#admin-blocks) on customer detail pages that gives merchants access to any reviews submitted by the customer.

#### 5.12 Returns and exchanges apps

Any app that facilitates the process of managing and processing product returns, exchanges, and refunds for customers.

#### 5.12.1 Sync returns information

Your app must use the appropriate APIs to communicate all lifecycle events of a return to Shopify. These include:

* [Creating returns](https://shopify.dev/docs/api/admin-graphql/latest/mutations/returnCreate)
* [Shipping creation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/reverseDeliveryCreateWithShipping)
* [Restocking](https://shopify.dev/docs/api/admin-graphql/latest/mutations/reverseFulfillmentOrderDispose)
* [Removing items from a return](https://shopify.dev/docs/api/admin-graphql/latest/mutations/returnLineItemRemoveFromReturn)
* [Cancelling a return](https://shopify.dev/docs/api/admin-graphql/latest/mutations/returnCancel)
* [Closing returns](https://shopify.dev/docs/api/admin-graphql/latest/mutations/returnClose)
* [Providing refunds](https://shopify.dev/docs/api/admin-graphql/latest/mutations/refundCreate)

#### 5.12.2 Include exchange line items

Your app must create [exchange line items](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ExchangeLineItemInput) on an order when managing exchanges. You must also remove exchange lines from the order if they are no longer needed.

#### 5.12.3 Include shipping and restocking fees

Your app must add [shipping fees](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ReturnShippingFeeInput) and [restocking fees](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/RestockingFeeInput) on an order when applicable.

#### 5.13 SMS marketing apps

Any app that enables merchants to communicate with customers via targeted SMS campaigns.

#### 5.13.1 Use web pixels for SMS marketing apps

If your app provides automation, segmentation, analytics, or pixels, it must create and use [Web Pixel extensions](https://shopify.dev/docs/apps/build/marketing-analytics/build-web-pixels) to subscribe to relevant events emitted by Shopify when needed. You may not use script tags or require merchants to copy JavaScript into their stores in order to gather this data.

#### 5.13.2 Sync customer data for SMS marketing apps

Your app must sync all [customer](https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerCreate) information to and from Shopify as required by the [Shopify API License and Terms of Use](https://www.shopify.com/legal/api-terms#2-using-the-shopify-a-p-i).

#### 5.13.3 Use Shopify segments for SMS marketing apps

Your app must allow merchants to use any segment defined in the Shopify admin when targeting advertisements or any other operation that targets multiple customers. It must also make these actions available through a [customer segment action extension](https://shopify.dev/docs/apps/build/marketing-analytics/customer-segments/build-an-action-extension).

#### 5.13.4 Help merchants to identify visitors to their store for SMS marketing apps

Your app must use the [visitors API](https://shopify.dev/docs/api/web-pixels-api/emitting-data#visitor-api) to log identifying information, such as emails or phone numbers, for any customers that provide this information on the Online Store.

#### 5.14 Subscription apps

Any app that enables customers to purchase products on a recurring basis.

#### 5.14.1 Use subscription objects and APIs

Your app must use the following subscriptions objects and APIs:

* [Selling plan API](https://shopify.dev/docs/api/admin-graphql/latest/objects/sellingplan) to create and manage various ways to sell and buy products
* [Subscription contract API](https://shopify.dev/docs/api/admin-graphql/latest/objects/subscriptioncontract) to create, manage, and update subscription agreements between a customer and merchant in real time
* [Customer payment method API](https://shopify.dev/docs/api/admin-graphql/latest/objects/customerpaymentmethod) to store payment methods that can be used to pay for future orders without requiring the customer to manually go through checkout

#### 5.14.2 Use theme app block extensions

Your app must add subscriptions on product detail pages by using an [app block for themes](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-blocks-for-themes) that is compatible with [Online Store 2.0](https://shopify.dev/docs/storefronts/themes/os20).

#### 5.14.3 Follow subscriptions UX guidelines

Your app must obey the following [subscriptions UX guidelines](https://shopify.dev/docs/storefronts/themes/pricing-payments/subscriptions/subscription-ux-guidelines):

* The subscription information — including selling plan name, price, and savings — must be clearly displayed on the product, cart, and order detail pages.
* The subscription option information must automatically match the color palette, font, font-size, and font weight of the store's current theme by default.

#### 5.14.4 Use Customer Account UI extensions

Your app must use [Customer Account UI extensions](https://shopify.dev/docs/api/customer-account-ui-extensions) to enable customers to view and manage their subscriptions.
