---
title: Apps in App Home
description: >-
  Learn how to build your app's main interface in the Shopify admin using web
  components, APIs, App Bridge web components, and page patterns.
source_url:
  html: 'https://shopify.dev/docs/apps/build/app-home'
  md: 'https://shopify.dev/docs/apps/build/app-home.md'
---

# Apps in App Home

When you build an app for Shopify, it has a main experience inside the Shopify admin called App Home. This is where your app's UI lives, and where merchants go to configure settings, view data, and manage workflows. App Home also includes APIs, patterns, and components that help your app communicate with the rest of Shopify and feel native to the admin.

To get started, [scaffold an app](https://shopify.dev/docs/apps/build/scaffold-app) using Shopify CLI, then [build your first app](https://shopify.dev/docs/apps/build/build?framework=reactRouter).

***

## How it works

The Shopify admin embeds your app in a dedicated surface. This surface is where your app renders its pages and where merchants interact with your UI.

[App Home](https://shopify.dev/docs/api/app-home) consists of four building blocks:

* **[Patterns](https://shopify.dev/docs/api/app-home/patterns)** combine APIs and web components into pre-built layouts for common screens like homepages and settings pages. Start here to build the pages most apps need.
* **[APIs](https://shopify.dev/docs/api/app-home/apis)** let your app communicate with the Shopify admin outside the surface, reading data, triggering workflows, and showing feedback to merchants.
* **[Web components](https://shopify.dev/docs/api/app-home/web-components)** are native HTML elements from Shopify's Polaris design system that you use to build your app's UI inside the surface.
* **[App Bridge web components](https://shopify.dev/docs/api/app-home/app-bridge-web-components)** add elements like title bars and nav menus to the surrounding admin chrome, outside your app's surface.

![The Shopify admin showing an app in App Home. App Bridge web components like the title bar are highlighted in green at the top. Polaris web components like form fields are highlighted in blue inside the app surface. APIs communicate outside the surface. Page patterns provide pre-built layouts inside it.](https://shopify.dev/assets/assets/images/apps/build/app-home-building-blocks-Dzpq2G8j.png)

### Patterns

We recommend building your app with patterns. They combine APIs and web components into common layouts most apps need, so you can start with proven combinations and branch out from there. Patterns also help your app meet [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify) standards out of the box.

There are two types of patterns:

* **Templates** are full-page layouts for paths found in most Shopify apps, like homepages, settings pages, and resource index and detail pages. Use a template as your app's starting point so it feels familiar in the Shopify admin.
* **Compositions** are smaller groupings of web components and APIs that solve specific tasks within a page, like data tables, empty states, and setup guides. Combine compositions inside a template to build out your pages.

For example, the [setup guide](https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide) composition provides progress tracking and collapsible onboarding steps, built from a combination of Polaris web components.

![A setup guide pattern showing progress tracking and onboarding steps.](https://shopify.dev/assets/assets/images/templated-apis-screenshots/admin/patterns/setupGuide-Dnf6rLx-.png)

### APIs

APIs let your app communicate with the Shopify admin outside the surface, including reading data, triggering workflows, and showing feedback to merchants through toasts and modals. Your app can also query the [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql) directly from front-end code using the [Resource Fetching API](https://shopify.dev/docs/api/app-home/apis/authentication-and-data/resource-fetching-api).

For example, the [Intents API](https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/intents-api) lets your app launch admin workflows like creating a collection. The merchant completes the form using the standard Shopify admin UI, and your app receives the result.

![The Intents API launching the collection creation workflow in the Shopify admin.](https://shopify.dev/assets/assets/images/templated-apis-screenshots/admin/apis/intents-bqfuEvyn.png)

### Web components

You build your app's interface inside the surface using web components. [Polaris](https://shopify.dev/docs/apps/design), Shopify's unified system for building app interfaces, provides buttons, forms, tables, pages, and other native HTML elements that match the look and feel of the Shopify admin. Because they follow the [Web Components standard](https://developer.mozilla.org/en-US/docs/Web/Web_Components), they work with any framework or vanilla JavaScript.

For example, the Polaris [section](https://shopify.dev/docs/api/app-home/web-components/layout-and-structure/section) component renders a card with a heading and description. These native HTML elements are the building blocks of your app's interface.

![A Polaris section component with a heading and description text.](https://shopify.dev/assets/assets/images/templated-apis-screenshots/admin/components/section-C8sCHOz2.png)

### App Bridge web components

App Bridge web components render UI elements in the admin chrome outside your app's iframe, like title bars, navigation menus, and save bars.

For example, the [title bar](https://shopify.dev/docs/api/app-home/app-bridge-web-components/title-bar) component adds breadcrumb navigation, a status badge, action buttons, and a dropdown menu.

![A title bar with breadcrumb navigation, a status badge, action buttons, and a dropdown menu.](https://shopify.dev/assets/assets/images/templated-apis-screenshots/admin/app-bridge-web-components/title-bar-complete-example-Cdl0kCO5.png)

***

## What you can build

App Home is a full-stack surface, so you can build any merchant-facing experience. Beyond the pre-built page patterns, you can combine web components and APIs to create:

* **Real-time dashboards** that pull live analytics from Shopify or your own data sources, so merchants can make decisions without leaving the admin.
* **Custom resource managers** that let merchants browse, filter, and act on products, orders, customers, or any data your app tracks.
* **Integration control centers** where merchants connect external services, monitor sync status, and troubleshoot issues in one place.
* **Guided workflows** that walk merchants through multi-step processes like onboarding, campaign setup, or inventory planning.

***

## Next steps

[Scaffold an app\
\
](https://shopify.dev/docs/apps/build/scaffold-app)

[Use Shopify CLI to generate a new app project with everything you need.](https://shopify.dev/docs/apps/build/scaffold-app)

[App Home reference\
\
](https://shopify.dev/docs/api/app-home)

[Explore web components, APIs, App Bridge web components, and page patterns.](https://shopify.dev/docs/api/app-home)

***
