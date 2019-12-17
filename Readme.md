### Hypothesis

Web browsers let us access most of human knowledge, but they do it in a way it
was prescribed by a site hosting the resource and do very little in terms of
capturing relevant information into local knowledge base. This experiment
explores ways to view web through different lens, e.g. viewing web page as an
image catalog or readable article, local anotations and possibly more... in an
assumbtion that captured web artifacts can seed ideas and help us identify
connections.

### Status: 💣 Experimental 💣

At the moment this is a **reasearch experiment** that is unlikely to be useful,
however if you feel inlclined to try you can use <a href="javascript:((d) => {d.addEventListener('securitypolicyviolation',function(){alert('Can not load artifact due to content security policy restrictions');});var script = d.createElement('script'); script.src = 'http://localhost:5000/dist/bookmarklet.js'; d.head.appendChild(script); })(document);">
Artifacts</a> bookmarlet and run it on arbitrary page to see what happens. Bookmarklet does not work on sites that use [conten security policies][csp] to block third party scripts and in the future we plan to have a web-extension to overcome this limitation.

### Design

When bookmarklet is activated it loads a bookmarklet **host**, script that
injects an iframe into a document loading a bookmarklet **client** which
communicates with a host via [`MessagePort`][] API.

> In the future we plan to load **host** as browser extension [content script][]
> in order to overcome [content security][csp] restrictions. Other than that design will remain equivalent.

**Client** once loaded will issue request to a **host** to scrape document metadata, archive page, etc.... Which host fulfills and transfers response back to the **client** which then renders it in the UI.

### Preview cards

On clients request host will scrape metadata from the document for the "preview card" (that is similar to twitter, slack, apple messages, etc...)

Scraper attempts to extract following information from the document:

- URL
- Hero images
- Title
- Summary
- Site name

To accomplish this it looks for the following information to thevarios extent.

- [Open Graph][] metada.
- [Twitter Card][] metadata.
- [Apple Web Application][] metadata.
- [Microsoft Tile][] metadata.
- [structured data][] used by Google search.
- [microformats][].

If none of the above is found, it falls back to trying it's best at guessing
it via primitive algorithm inspired by [Mozilla Readability][] library.

### Web Archive (status:work in progress)

On client request host will archive a page via ([custom fork][freeze-dry fork] of) an excellent [freeze-dry][] library as web bundle file containing all the linked resources and transfer it back to a client in form of [`ArrayBuffer`][] of it's content.

> There is no shortage of file formats for representing web bundles:
>
> - [Webarchive][]
> - [Mozilla Archive Format (MAF)][maf]
> - [MHTML][]
> - [WARC][]
> - [WBN][]
> - [Dat Hyperdrive][dat guide]
> - [IPFS UnixFS][ipfs unixfs]
>
> However none is part of web standard or widely supported by mainstream browsers, there for figuring out right format for the task is part of this research.

Received web bundle then gets loaded into a special web bundle viewer.

### Web bundle Viewer (status:todo)

Given that no browser support viewing web bundles natively (except for Safari) for this reasearch we create a custom viewer using [service worker][] registered at `/webarchive/` and [sandboxed iframe][].

This allows us to e.g. access archived web bundle via URL like:

https://gozala.io/artifacts/webarchive/blob/dc265246-d4ca-f644-91a5-d4b33c4512fd

[service worker][] will take care of decoding corresponding web bundle file and serving all the linked resources per request.

[csp]: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
[open graph]: https://ogp.me/
[twitter card]: https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/markup
[microsoft tile]: https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/dn255024(v=vs.85)
[structured data]: https://developers.google.com/search/docs/guides/intro-structured-data
[microformats]: http://microformats.org/
[apple web application]: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
[mozilla readability]: https://github.com/mozilla/readability
[`messageport`]: https://developer.mozilla.org/en-US/docs/Web/API/MessagePort
[content script]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
[freeze-dry]: https://github.com/WebMemex/freeze-dry
[freeze-dry fork]: https://github.com/Gozala/freeze-dry/tree/bookmarklet
[`arraybuffer`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer
[wbn]: https://web.dev/web-bundles/
[warc]: https://en.wikipedia.org/wiki/Web_ARChive
[mhtml]: https://en.wikipedia.org/wiki/MHTML
[maf]: https://en.wikipedia.org/wiki/Mozilla_Archive_Format
[webarchive]: https://en.wikipedia.org/wiki/Webarchive
[dat guide]: https://datprotocol.github.io/how-dat-works/
[ipfs unixfs]: https://github.com/ipfs/specs/blob/master/UNIXFS.md
[service worker]: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers#Updating_your_service_worker
[sandboxed iframe]: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-sandbox
