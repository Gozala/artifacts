### Hypothesis

Web browsers let us access most of human knowledge, but they do it in a way it was prescribed by a site hosting the resource and
do very little in terms of capturing relevant information into local knowledge base. This experiment explores ways to view web
through different lens, e.g. viewing web page as an image catalog or readable article, local anotations and possibly more... in an
assumbtion that captured web artifacts can seed ideas and help us identify connections.


<a href="javascript:(async () => {const response = await fetch('https://gozala.io/artifacts/src/bookmarklet.js?time='+new Date().getTime());const blob = await response.blob();const url = URL.createObjectURL(blob);const script = document.createElement('script');script.src = url;document.head.append(script);script.onload = () => URL.revokeObjectURL(url);})()">
Artifacts</a> bookmarklet


### Status: Experiment

At the moment this is a reasearch experiment that is highly unlikely to be useful to anyone else.
