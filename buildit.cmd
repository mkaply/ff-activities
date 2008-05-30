del activities.xpi
copy chrome.manifest.jar chrome.manifest
cd chrome
del activities.jar
zip -r activities.jar content locale
cd ..
zip activities.xpi components\* chrome\activities.jar chrome.manifest defaults\preferences\prefs.js install.rdf LICENSE
copy chrome.manifest.flat chrome.manifest
