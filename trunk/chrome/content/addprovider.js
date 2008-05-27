/* window.arguments */
/*   0 - nsIFile for the downloaded service */
/*   1 - URL of the downloaded service */
/*   2 - structure for returning status (ok) and service name (name) */

var name;
var icon;
var category;
var host;

function onLoad() {
  const MODE_RDONLY   = 0x01;
  const PERMS_FILE    = 0644;

  var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                         .getService(Components.interfaces.nsIStringBundleService)
                         .createBundle("chrome://msft_activities/locale/activities.properties");
  var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                            .getService(Components.interfaces.nsIIOService);	  

  var fileInStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                               .createInstance(Components.interfaces.nsIFileInputStream);
  fileInStream.init(window.arguments[0], MODE_RDONLY, PERMS_FILE, false);

  var domParser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                            .createInstance(Components.interfaces.nsIDOMParser);

  var doc = domParser.parseFromStream(fileInStream, "UTF-8",
                                      window.arguments[0].fileSize,
                                      "text/xml");
  fileInStream.close();

  var homepageUrl = doc.getElementsByTagName("homepageUrl")[0]
  var activity = doc.getElementsByTagName("activity")[0]
  category = activity.getAttribute("category").replace(/^\s*|\s*$/g,'');
  var display = doc.getElementsByTagName("display")[0]
  name = display.getElementsByTagName("name")[0].textContent.replace(/^\s*|\s*$/g,'');
  try {
    icon = display.getElementsByTagName("icon")[0].textContent.replace(/^\s*|\s*$/g,'');
  } catch (ex) {
    /* Icon is optional */
  }

  document.getElementById("name").value = "\"" + name + "\"";
  /* window.arguments[1] contains the download URL of the service */
  /* We get the host so we can display it */
  document.getElementById("from").value = ioService.newURI(window.arguments[1], null, null).host;
  document.getElementById("type").value = category + " activity";
  /* We store the host in a global so we can use it if accept is pressed */
  host = ioService.newURI(homepageUrl.textContent, null, null).host;
  document.getElementById("webaddress").value = host;

  var usdir = Components.classes["@mozilla.org/file/directory_service;1"].
                          getService(Components.interfaces.nsIProperties).
                          get("ProfD", Components.interfaces.nsILocalFile);
  usdir.append("services");

  if (usdir.exists()) {
    usdir.append(category + "_" + host + ".xml");
    if (usdir.exists()) {
      var prefBranch = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService)
                                                               .getBranch("extensions.activities.");
      try {
        var DefaultActivity = prefBranch.getCharPref(category + ".DefaultActivity");
        if (DefaultActivity == host) {
          document.getElementById("makeDefault").checked = true;
          document.getElementById("makeDefault").disabled = true;
        }
      } catch (ex) {
        /* Pref isn't set - no problem */
      }
      document.getElementById("message").textContent = bundle.GetStringFromName("replaceMessage");
      document.documentElement.getButton("accept").label =  bundle.GetStringFromName("replaceButton");
    }
  }
}

function onAccept() {
  /* Get user profile directory and add "services" */
  var usdir = Components.classes["@mozilla.org/file/directory_service;1"]
                        .getService(Components.interfaces.nsIProperties)
                        .get("ProfD", Components.interfaces.nsILocalFile);
  usdir.append("services");

  /* If the directory doesn't exist, create it */
  if (!usdir.exists()) {
    usdir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
  }

  /* If we have an icon, download it */
  if (icon) {
    var iconfile = usdir.clone();

    var ios = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    var splitpath = icon.split(".");
    var extension = splitpath[splitpath.length-1];
    iconfile.append(category + "_" + host + "." + extension);
    try {
      iconfile.remove(false);                         
    } catch (ex) {
    }

    var channel = ios.newChannelFromURI(ios.newURI(icon, null, null));
    var downloader =
      Components.classes["@mozilla.org/network/downloader;1"]
                .createInstance(Components.interfaces.nsIDownloader);
    var listener = {
      onDownloadComplete: function(downloader, request, ctxt, status, result) {
      }
    }
    downloader.init(listener,iconfile);
    channel.asyncOpen(downloader, null);
  }
  
  var file = usdir.clone();
  file.append(category + "_" + host + ".xml");

  try {
    file.remove(false);                         
  } catch (ex) {
  }

  window.arguments[0].copyTo(usdir, category + "_" + host + ".xml");
  var prefBranch = Components.classes["@mozilla.org/preferences-service;1"]
                             .getService(Components.interfaces.nsIPrefService)
                             .getBranch("extensions.activities.");

  if (document.getElementById("makeDefault").checked) {
    prefBranch.setCharPref(category + ".DefaultActivity", host);
  }
  Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService)
            .notifyObservers(null, "openService", "add");

  window.arguments[2].ok = true;
  window.arguments[2].name = name;
}

function onCancel() {
  window.arguments[2].ok = false;
}

