const DEBUG = false; /* set to false to suppress debug messages */

const EXTERNAL_CONTRACTID       = "@microsoft.com/external;1";
const EXTERNAL_CID              = Components.ID("{672a724c-9a8e-4a2a-9ae5-9c9e66dbd644}");
const nsISupports               = Components.interfaces.nsISupports;
const nsIFactory                = Components.interfaces.nsIFactory;
const ieIExternal               = Components.interfaces.ieIExternal;
const ieIExternalCaps           = Components.interfaces.ieIExternalCaps;
const nsIClassInfo              = Components.interfaces.nsIClassInfo;
const nsISidebarExternal        = Components.interfaces.nsISidebarExternal;

function ieExternal()
{
}

ieExternal.prototype.AddSearchProvider =
function (aDescriptionURL)
{
  return Components.classes["@mozilla.org/sidebar;1"].
                    getService(nsISidebarExternal).
                    AddSearchProvider(aDescriptionURL);
}

ieExternal.prototype.IsSearchProviderInstalled =
function (aSearchURL)
{
  return Components.classes["@mozilla.org/sidebar;1"].
                    getService(nsISidebarExternal).
                    IsSearchProviderInstalled(aSearchURL);
}

ieExternal.prototype.AddService =
function (filename)
{
  return this.addService(filename);
}

function isValidService(doc) {
  var contexts =  {"selection" : true, "document" : true, "link" : true };

  var ns = "http://www.microsoft.com/schemas/openservicedescription/1.0";

  var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                            .getService(Components.interfaces.nsIIOService);	  

  var openServiceDescriptions = doc.getElementsByTagNameNS(ns, "openServiceDescription");
  if (openServiceDescriptions.length != 1) {
    return false;
  }

  if (doc.firstChild != openServiceDescriptions[0]) {
    return false;
  }
  var homepageUrls = doc.getElementsByTagNameNS(ns, "homepageUrl");
  if (homepageUrls.length == 0) {
    return false;
  }
  var homepageUrl = homepageUrls[0].textContent.replace(/^\s*|\s*$/g,'');
  try {
    var homepageHost = ioService.newURI(homepageUrl, null, null).host;
  } catch (ex) {
    return false;
  }

  var displays = doc.getElementsByTagNameNS(ns, "display");
  if (displays.length == 0) {
    return false;
  }
  var names = displays[0].getElementsByTagNameNS(ns, "name");
  if (names.length == 0) {
    return false;
  }
  var name = names[0].textContent.replace(/^\s*|\s*$/g,'');
  if (name.length == 0) {
    return false;
  }

  var activities = doc.getElementsByTagNameNS(ns, "activity");
  if (activities.length == 0) {
    return false;
  }
  var activity = activities[0];
  if (!activity.hasAttribute("category")) {
    return false;
  }
  var category = activity.getAttribute("category").replace(/^\s*|\s*$/g,'');
  if (category.length == 0) {
    return;
  }

  var activityActions = activity.getElementsByTagNameNS(ns, "activityAction");
  if (activityActions.length == 0) {
    return false;
  }
  for (let i=0; i < activityActions.length; i++) {
    var activityAction = activityActions[i];
    if (activityAction.hasAttribute("context")) {
      var context = activityAction.getAttribute("context").replace(/^\s*|\s*$/g,'');
      if (!contexts[context]) {
        return false;
      }
    }
    var executes = activityAction.getElementsByTagNameNS(ns, "execute");
    if (executes.length == 0) {
      return false;
    }
    var execute = executes[0];
    if (!execute.hasAttribute("action")) {
      return false;
    }
    var executeAction = execute.getAttribute("action").replace(/^\s*|\s*$/g,'');;
    try {
      var executeActionHost = ioService.newURI(executeAction, null, null).host;
    } catch (ex) {
      return false;
    }
    if (!executeActionHost.match(homepageHost + "$")) {
      return false;
    }
    var executeParameters = execute.getElementsByTagNameNS(ns, "parameter");
    if (executeParameters.length > 0) {
      for (let j=0; j < executeParameters.length; j++) {
        if (!executeParameters[j].hasAttribute("name")) {
          return false;
        }
        if (!executeParameters[j].hasAttribute("value")) {
          return false;
        }
      }
    }
    var previews = activityAction.getElementsByTagNameNS(ns, "preview");
    if (previews.length > 0) {
      var preview = previews[0];
      if (!preview.hasAttribute("action")) {
        return false;
      }
      var previewAction = preview.getAttribute("action").replace(/^\s*|\s*$/g,'');;
      try {
        var previewActionHost = ioService.newURI(previewAction, null, null).host;
      } catch (ex) {
        return false;
      }
      if (!previewActionHost.match(homepageHost + "$")) {
        return false;
      }
      var previewParameters = preview.getElementsByTagNameNS(ns, "parameter");
      if (previewParameters.length > 0) {
        for (let j=0; j < previewParameters.length; j++) {
          if (!previewParameters[j].hasAttribute("name")) {
            return false;
          }
          if (!previewParameters[j].hasAttribute("value")) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

ieExternal.prototype.addService =
function (filename)
{
  /* Get the current window so we can figure out the URL */
  /* and open dialogs */
  var win = Components.classes['@mozilla.org/appshell/window-mediator;1']
                      .getService(Components.interfaces.nsIWindowMediator)
                      .getMostRecentWindow("navigator:browser");

  var ios = Components.classes["@mozilla.org/network/io-service;1"].
                       getService(Components.interfaces.nsIIOService);

  var temp_uri = ios.newURI(win.content.location.href, null, null);
  var uri = ios.newURI(temp_uri.resolve(filename), null, null);
  
  uri.QueryInterface(Components.interfaces.nsIURL);
  var leafName = uri.fileName;
  
  var profiledir = Components.classes["@mozilla.org/file/directory_service;1"].
                              getService(Components.interfaces.nsIProperties).
                              get("TmpD", Components.interfaces.nsIFile);

  profiledir.append(leafName);
  profiledir.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);
  profiledir.remove(false);

  var channel = ios.newChannelFromURI(uri);
  var downloader =
    Components.classes["@mozilla.org/network/downloader;1"].
      createInstance(Components.interfaces.nsIDownloader);

  var listener = {
    onDownloadComplete: function(downloader, request, ctxt, status, result) {
      const MODE_RDONLY   = 0x01;
      const PERMS_FILE    = 0644;

      var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                             .getService(Components.interfaces.nsIStringBundleService	)
                             .createBundle("chrome://msft_activities/locale/activities.properties");
      var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
                                                 getService(Components.interfaces.nsIPromptService);

      /* Need result as an nsiHttpChannel to check for 404 */
      if (Components.isSuccessCode(status)) { 
        request.QueryInterface(Components.interfaces.nsIHttpChannel);
      }
      if (!Components.isSuccessCode(status) || (Components.isSuccessCode(status) && !request.requestSucceeded)) {
        promptService.alert(win, bundle.GetStringFromName("activitiesTitle"), bundle.GetStringFromName("installError"));
        return;
      }

      /* Need result as an nsiFile */
      result.QueryInterface(Components.interfaces.nsIFile);

      /* Open downloaded file and parse it so we can check for errors */
      var fileInStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                                    .createInstance(Components.interfaces.nsIFileInputStream);
      fileInStream.init(result, MODE_RDONLY, PERMS_FILE, false);
      var domParser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                                .createInstance(Components.interfaces.nsIDOMParser);
      var error = false;
      var securityerror = false;
      try {
        var doc = domParser.parseFromStream(fileInStream, "UTF-8",
                                            result.fileSize,
                                            "text/xml");
      } catch (ex) {
        securityerror = true;
      }
      fileInStream.close();

      securityerror = !isValidService(doc);

      /* Display appropriate error message if we had an error */
      if (securityerror) {
        promptService.alert(win, bundle.GetStringFromName("activitiesTitle"), bundle.GetStringFromName("securityError")); 
      } else {
        var retVals = { ok: null, name: null };
        win.openDialog('chrome://msft_activities/content/addprovider.xul','addprovider','chrome,centerscreen,modal', result, win.content.location.href, retVals);
        if (retVals.ok) {
          promptService.alert(win, bundle.GetStringFromName("activitiesTitle"), bundle.GetStringFromName("installSuccessful") + retVals.name); 
        } else {
          /* delete temporary file */
        }
      }
    }
  }

  downloader.init(listener, profiledir);
  channel.asyncOpen(downloader, null);
}

// property of nsIClassInfo
ieExternal.prototype.flags = nsIClassInfo.DOM_OBJECT;

// property of nsIClassInfo
ieExternal.prototype.classDescription = "External";

// method of nsIClassInfo
ieExternal.prototype.getInterfaces = function(count) {
    var interfaceList = [ieIExternal, ieIExternalCaps, nsIClassInfo, nsISidebarExternal];
    count.value = interfaceList.length;
    return interfaceList;
}

// method of nsIClassInfo
ieExternal.prototype.getHelperForLanguage = function(count) {return null;}

ieExternal.prototype.QueryInterface =
function (iid) {
    if (!iid.equals(ieIExternal) &&
        !iid.equals(ieIExternalCaps) &&
        !iid.equals(nsISidebarExternal) &&
        !iid.equals(nsIClassInfo) &&
        !iid.equals(nsISupports))
        throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
}

var externalModule = new Object();
externalModule.firstTime = true;

externalModule.registerSelf =
function (compMgr, fileSpec, location, type)
{

  if (this.firstTime) {
    this.firstTime = false;
    /* Only delay registration if we a FF3 beta prior to 4 */
    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]  
                            .getService(Components.interfaces.nsIXULAppInfo);
    var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                                   .getService(Components.interfaces.nsIVersionComparator);
    if ((versionChecker.compare(appInfo.version, "3.0b4") < 0) &&
        (versionChecker.compare(appInfo.version, "2.0.0.*") > 0)) {
      debug("*** Deferring registration of ieExternal JS components\n");
      throw Components.results.NS_ERROR_FACTORY_REGISTER_AGAIN;
    }
  }
  debug("ieExternal registering (all right -- a JavaScript module!)");
  compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);

  compMgr.registerFactoryLocation(EXTERNAL_CID, 
                                  "External JS Component",
                                  EXTERNAL_CONTRACTID, 
                                  fileSpec, 
                                  location,
                                  type);
  const CATMAN_CONTRACTID = "@mozilla.org/categorymanager;1";
  const nsICategoryManager = Components.interfaces.nsICategoryManager;
  var catman = Components.classes[CATMAN_CONTRACTID].
                          getService(nsICategoryManager);
                          
  const JAVASCRIPT_GLOBAL_PROPERTY_CATEGORY = "JavaScript global property";
  catman.addCategoryEntry(JAVASCRIPT_GLOBAL_PROPERTY_CATEGORY,
                          "external",
                          EXTERNAL_CONTRACTID,
                          true,
                          true);
}

externalModule.getClassObject =
function (compMgr, cid, iid) {
    if (!cid.equals(EXTERNAL_CID))
        throw Components.results.NS_ERROR_NO_INTERFACE;
    
    if (!iid.equals(Components.interfaces.nsIFactory))
        throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
    return externalFactory;
}

externalModule.canUnload =
function(compMgr)
{
    debug("Unloading component.");
    return true;
}
    
/* factory object */
var externalFactory = new Object();

externalFactory.createInstance =
function (outer, iid) {
    debug("CI: " + iid);
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    return (new ieExternal()).QueryInterface(iid);
}

/* entrypoint */
function NSGetModule(compMgr, fileSpec) {
    return externalModule;
}

/* static functions */
if (DEBUG)
    debug = function (s) { dump("-*- external component: " + s + "\n"); }
else
    debug = function (s) {}

