---
title: About app distribution
description: >-
  Learn about how to deploy and publish your app, and the ways that you can
  distribute your app to merchants.
source_url:
  html: 'https://shopify.dev/docs/apps/launch/distribution'
  md: 'https://shopify.dev/docs/apps/launch/distribution.md'
---

# About app distribution

After you've added features to your app, you need to decide how to distribute it to merchants.

The way you choose to distribute your app depends on its purpose and your audience. You can't change the distribution method after you select it, so make sure that you understand the different capabilities and requirements of each type.

***

## Capabilities and requirements

The following table shows the capabilities and requirements that are associated with each distribution method:

| Distribution model | Number of stores | App type | Authorization or authentication method | Approval required | Limitations |
| - | - | - | - | - | - |
| [Public distribution](https://shopify.dev/docs/apps/launch/app-store-review) | Can be installed on multiple Shopify stores | Public | * If embedded, [token exchange](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange) and [session tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens)* If not embedded, [authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) | [Yes](https://shopify.dev/docs/apps/launch/app-requirements-checklist) | Must [sync certain data](https://www.shopify.com/legal/api-terms) with Shopify |
| [Custom distribution](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method#install-a-custom-app-on-multiple-stores) | Installed on a single Shopify store, on multiple stores that belong to the same Plus organization or any [transfer-disabled development stores](https://shopify.dev/docs/storefronts/themes/tools/development-stores/transfer-development-stores#transfer-disabled-stores) | Custom | * If embedded, [token exchange](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange) and [session tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens)* If not embedded, [authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) | No | Can't use the [Billing API](https://shopify.dev/docs/apps/launch/billing) to charge merchants |
| Shopify admin | Installed on a single Shopify store | Custom | [Authenticate in the Shopify admin](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin) | No | * Can't use [Shopify App Bridge](https://shopify.dev/docs/api/app-home) to display in the Shopify admin* Can't use [app extensions](https://shopify.dev/docs/apps/build/app-extensions)* Can't use the [Billing API](https://shopify.dev/docs/apps/launch/billing) to charge merchants |

**Note:**

Checkout apps and extensions have [design requirements](https://shopify.dev/docs/apps/launch/app-requirements-checklist#design-requirements-for-checkout-apps) that apply to custom apps as well as public apps. Be sure that your app meets [all requirements](https://shopify.dev/docs/apps/launch/app-requirements-checklist) for its functionality and distribution type.

### Requesting a content size limit exception

Theme app extensions are subject to [file and content size limits](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#file-and-content-size-limits). If your app uses [custom distribution](https://shopify.dev/docs/apps/launch/distribution), or your app has been granted [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify) status in the Shopify App Store, then you can request an exception to the 100 KB Liquid size limit for a theme app extension. File an exemption request [using this form](https://forms.gle/rTvBRBPHjxdNFSbHA).

Increasing your app's Liquid size could potentially impact its performance. Regular monitoring and optimization is advised.

***

## Deprecated app types

The following app types can no longer be created:

* **Private apps**: Deprecated as of January 2022. A private app was a type of app that one merchant could install directly on their store. If you want to create an app specifically for one merchant's store, then you can create a custom app instead. As of January 20, 2023, all private apps have been automatically migrated and converted to custom apps.
* **Unpublished apps**: Deprecated as of December 9, 2019. An unpublished app was a type of public app that one or many merchants could install and had all the same functionality as other public apps. However, the app didn't require any approval from Shopify.

***

## Next steps

[Learn how to select a distribution method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method).

***
