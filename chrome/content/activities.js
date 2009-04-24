var Activities = {};

(function () {
  var namespaceURI = "http://www.microsoft.com/schemas/openservicedescription/1.0";
  var prefBranch = null;
  var prefObserver;
  var openServiceObserver;
  var ioService;
  var textToSubURI;
  var searchWithString;
  var previewTimerID;
  var hidePreviewTimerID;
  var hideContextMenuTimerID;
  var internalHide = false;
  var dontHide = false;
  services = [];
  function migrate() {
    const MODE_RDONLY   = 0x01;
    const PERMS_FILE    = 0644;

    var olddir = Components.classes["@mozilla.org/file/directory_service;1"].
                            getService(Components.interfaces.nsIProperties).
                            get("ProfD", Components.interfaces.nsILocalFile);

    olddir.append("activities");

    if (!olddir.exists() || !olddir.isDirectory()) {
      return;
    }
    
    var newdir = Components.classes["@mozilla.org/file/directory_service;1"].
                            getService(Components.interfaces.nsIProperties).
                            get("ProfD", Components.interfaces.nsILocalFile);
                            
    newdir.append("services");
    
    if (!newdir.exists()) {
      newdir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
    }
    
    /* Load user scripts from the operator directory in the profile */
    var e = olddir.directoryEntries;
    var domParser = new DOMParser();
    while (e.hasMoreElements()) {
      var f = e.getNext().QueryInterface(Components.interfaces.nsIFile);
      var splitpath = f.path.split(".");
      /* Only load XML files */
      if (splitpath[splitpath.length-1] == "xml") {
        var sourcefile = Components.classes["@mozilla.org/file/local;1"]
                                   .createInstance(Components.interfaces.nsILocalFile);
        sourcefile.initWithPath(f.path);

        var fileInStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                                     .createInstance(Components.interfaces.nsIFileInputStream);
        var cis = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                            .createInstance(Components.interfaces.nsIConverterInputStream);

        fileInStream.init(sourcefile, MODE_RDONLY, PERMS_FILE, false);
        cis.init(fileInStream,  null, sourcefile.fileSize, Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
        var xmlFile = {value:null};
        cis.readString(sourcefile.fileSize, xmlFile);
        cis.close();

        var doc = domParser.parseFromString(xmlFile.value.replace(/^\s+/,""), "text/xml");

        var homepageUrl = doc.getElementsByTagNameNS(namespaceURI, "homepageUrl")[0]
        var host = ioService.newURI(homepageUrl.textContent.replace(/^\s*|\s*$/g,''), null, null).host;
        
        var activity = doc.getElementsByTagNameNS(namespaceURI, "activity")[0]
        var category = activity.getAttribute("category").replace(/^\s*|\s*$/g,'');
    
        var out_filename = category + "_" + host + ".xml";
        
        sourcefile.moveTo(newdir, out_filename);
        
        
        var display = doc.getElementsByTagNameNS(namespaceURI, "display")[0]
        try {
          var icon = display.getElementsByTagNameNS(namespaceURI, "icon")[0].textContent.replace(/^\s*|\s*$/g,'');
        } catch (ex) {
          /* Icon is optional */
        }
        if (icon) {
          var iconfile = newdir.clone();
          
          var uri = ioService.newURI(icon, null, null);
          /* Need URL to get leafName */
          uri.QueryInterface(Components.interfaces.nsIURL);
          var splitpath = uri.fileName.split(".");
          var extension = splitpath[splitpath.length-1];
          iconfile.append(category + "_" + host + "." + extension);
          try {
            iconfile.remove(false);                         
          } catch (ex) {
          }
    
          var channel = ioService.newChannelFromURI(uri);
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
      }
    }
    olddir.remove(true);
  }
  function serviceObjectFromDocument(doc) {
    var serviceObject = {};

    serviceObject.HomepageURL = doc.getElementsByTagNameNS(namespaceURI, "homepageUrl")[0].textContent.replace(/^\s*|\s*$/g,'');
    serviceObject.Domain = ioService.newURI(serviceObject.HomepageURL, null, null).host;
    var display = doc.getElementsByTagNameNS(namespaceURI, "display")[0];
    serviceObject.DisplayName = display.getElementsByTagNameNS(namespaceURI, "name")[0].textContent.replace(/^\s*|\s*$/g,'');
    try {
      serviceObject.Icon = display.getElementsByTagNameNS(namespaceURI, "icon")[0].textContent.replace(/^\s*|\s*$/g,'');
    } catch (ex) {
      /* Icon is optional */
    }
    try {
      serviceObject.Description = display.getElementsByTagNameNS(namespaceURI, "description")[0].textContent.replace(/^\s*|\s*$/g,'');
    } catch (ex) {
      /* Description is optional */
    }
    var activity = doc.getElementsByTagNameNS(namespaceURI, "activity")[0];
    serviceObject.Verb = activity.getAttribute("category").replace(/^\s*|\s*$/g,'');
    /* Check if the activity is disabled in preferences */
    try {
      serviceObject.Enabled = !prefBranch.getBoolPref(encodeURI(serviceObject.Verb) + "." + serviceObject.Domain + ".disabled");
    } catch (ex) {
      serviceObject.Enabled = true;
    }
    var activityActions = activity.getElementsByTagNameNS(namespaceURI, "activityAction");
    serviceObject.ActionCount = activityActions.length;
    for (let i=1; i<=activityActions.length; i++) {
      serviceObject["Action"+i] = {};
      if (activityActions[i-1].hasAttribute("context")) {
        serviceObject["Action"+i].Context = activityActions[i-1].getAttribute("context").replace(/^\s*|\s*$/g,'');
      } else {
        serviceObject["Action"+i].Context = "selection";
      }
      var previews = activityActions[i-1].getElementsByTagNameNS(namespaceURI, "preview");
      if (previews.length > 0) {
        serviceObject["Action"+i].HasPreview = true;
        var preview = previews[0];
        serviceObject["Action"+i].preview = {};
        serviceObject["Action"+i].preview.Action = preview.getAttribute("action").replace(/^\s*|\s*$/g,'');
        if (preview.hasAttribute("accept-charset")) {
          serviceObject["Action"+i].preview["Accept-charset"] = preview.getAttribute("accept-charset").replace(/^\s*|\s*$/g,'');
        } else {
          serviceObject["Action"+i].preview["Accept-charset"] = "utf-8";
        }
        if (preview.hasAttribute("enctype")) {
          serviceObject["Action"+i].preview.Enctype = preview.getAttribute("enctype").replace(/^\s*|\s*$/g,'');
        }
        if (preview.hasAttribute("method")) {
          serviceObject["Action"+i].preview.Method = preview.getAttribute("method").replace(/^\s*|\s*$/g,'');
        } else {
          serviceObject["Action"+i].preview.Method = "GET";
        }
        var parameters = preview.getElementsByTagNameNS(namespaceURI, "parameter");
        serviceObject["Action"+i].preview.ParamCount = parameters.length;
        for (let j=1; j<=parameters.length; j++) {
          serviceObject["Action"+i].preview["Parameter"+j] = {};
          serviceObject["Action"+i].preview["Parameter"+j].Name = parameters[j-1].getAttribute("name").replace(/^\s*|\s*$/g,'');
          if (parameters[j-1].hasAttribute("value")) {
            serviceObject["Action"+i].preview["Parameter"+j].Value = parameters[j-1].getAttribute("value").replace(/^\s*|\s*$/g,'');
          }
          if (parameters[j-1].hasAttribute("type")) {
            serviceObject["Action"+i].preview["Parameter"+j].Type = parameters[j-1].getAttribute("type").replace(/^\s*|\s*$/g,'');
          } else {
            serviceObject["Action"+i].preview["Parameter"+j].Type = "text";
          }
        }
      }
      var execute = activityActions[i-1].getElementsByTagNameNS(namespaceURI, "execute")[0];
      serviceObject["Action"+i].execute = {};
      serviceObject["Action"+i].execute.Action = execute.getAttribute("action").replace(/^\s*|\s*$/g,'');
      if (execute.hasAttribute("accept-charset")) {
        serviceObject["Action"+i].execute["Accept-charset"] = execute.getAttribute("accept-charset").replace(/^\s*|\s*$/g,'');
      } else {
        serviceObject["Action"+i].execute["Accept-charset"] = "utf-8";
      }
      if (execute.hasAttribute("enctype")) {
        serviceObject["Action"+i].execute.Enctype = execute.getAttribute("enctype").replace(/^\s*|\s*$/g,'');
      }
      if (execute.hasAttribute("method")) {
        serviceObject["Action"+i].execute.Method = execute.getAttribute("method").replace(/^\s*|\s*$/g,'');
      } else {
        serviceObject["Action"+i].execute.Method = "GET";
      }
      var parameters = execute.getElementsByTagNameNS(namespaceURI, "parameter");
      serviceObject["Action"+i].execute.ParamCount = parameters.length;
      for (let j=1; j<=parameters.length; j++) {
        serviceObject["Action"+i].execute["Parameter"+j] = {};
        serviceObject["Action"+i].execute["Parameter"+j].Name = parameters[j-1].getAttribute("name").replace(/^\s*|\s*$/g,'');
        if (parameters[j-1].hasAttribute("value")) {
          serviceObject["Action"+i].execute["Parameter"+j].Value = parameters[j-1].getAttribute("value").replace(/^\s*|\s*$/g,'');
        }
        if (parameters[j-1].hasAttribute("type")) {
          serviceObject["Action"+i].execute["Parameter"+j].Type = parameters[j-1].getAttribute("type").replace(/^\s*|\s*$/g,'');
        } else {
          serviceObject["Action"+i].execute["Parameter"+j].Type = "text";
        }
      }
    }
    return serviceObject;
  }
  function reloadActions()
  {
    services = [];

    const MODE_RDONLY   = 0x01;
    const MODE_WRONLY   = 0x02;
    const MODE_CREATE   = 0x08;
    const MODE_APPEND   = 0x10;
    const MODE_TRUNCATE = 0x20;

    const PERMS_FILE      = 0644;
    const PERMS_DIRECTORY = 0755;
    var usdir = Components.classes["@mozilla.org/file/directory_service;1"].
                            getService(Components.interfaces.nsIProperties).
                            get("ProfD", Components.interfaces.nsILocalFile);
    usdir.append("services");

    if (usdir.exists() && usdir.isDirectory()) {
      /* Load user scripts from the operator directory in the profile */
      var e = usdir.directoryEntries;
      var domParser = new DOMParser();
      while (e.hasMoreElements()) {
        var f = e.getNext().QueryInterface(Components.interfaces.nsIFile);
        var splitpath = f.path.split(".");
        /* Only load XML files */
        if (splitpath[splitpath.length-1] == "xml") {
            var sourcefile = Components.classes["@mozilla.org/file/local;1"]
                                       .createInstance(Components.interfaces.nsILocalFile);
            sourcefile.initWithPath(f.path);

            var fileInStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                                         .createInstance(Components.interfaces.nsIFileInputStream);
            var cis = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
                                .createInstance(Components.interfaces.nsIConverterInputStream);

            fileInStream.init(sourcefile, MODE_RDONLY, PERMS_FILE, false);
            cis.init(fileInStream,  null, sourcefile.fileSize, Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
            var xmlFile = {value:null};
            cis.readString(sourcefile.fileSize, xmlFile);
            cis.close();

            var doc = domParser.parseFromString(xmlFile.value.replace(/^\s+/,""), "text/xml");

            var serviceObject = serviceObjectFromDocument(doc);
            if (!services[serviceObject.Verb]) {
              services[serviceObject.Verb] = {}; 
            }
            /* This is really ugly. If we have an icon URL, get the extension */
            /* and then access the local file version */
            if (serviceObject.Icon) {
              var iconfile = f.clone();
              
              var uri = ioService.newURI(serviceObject.Icon, null, null);
              /* Need an nsIURL to get leafName */
              uri.QueryInterface(Components.interfaces.nsIURL);
              var splitpath = uri.fileName.split(".");
              var extension = splitpath[splitpath.length-1];
              iconfile.leafName = serviceObject.Verb + "_" + serviceObject.Domain + "." + extension;

              serviceObject.Icon = ioService.newFileURI(iconfile).spec;
            }
            services[serviceObject.Verb][serviceObject.Domain] = serviceObject;
        }
      }
    }
  }
  /* This function handles the window startup piece, initializing the UI and preferences */
  function startup()
  {
	var firstrun = false;
	try {
	  firstrun = prefBranch.getBoolPref("firstrun");
	} catch(ex) {
	  firstrun = true;
	}
	/* get installed version */
    var em = Cc["@mozilla.org/extensions/manager;1"]
                       .getService(Ci.nsIExtensionManager);

    var curVersion = em.getItemForID("activities@kaply.com").version;

	if (firstrun) {
      window.setTimeout(function(){
        gBrowser.selectedTab = gBrowser.addTab("http://kaply.com/activities/install");
      }, 1500); //Firefox 2 fix - or else tab will get closed
	  prefBranch.setBoolPref("firstrun", false);
	  prefBranch.setCharPref("installedVersion", curVersion);
	} else {
	  var installedVersion = prefBranch.getCharPref("installedVersion");
	  if (curVersion > installedVersion) {
      window.setTimeout(function(){
        gBrowser.selectedTab = gBrowser.addTab("http://kaply.com/activities/upgrade");
      }, 1500); //Firefox 2 fix - or else tab will get closed
  	    prefBranch.setCharPref("installedVersion", curVersion);
	  }
	}


    /* Add an observer so we see changes to prefs */
    prefObserver = {
      observe: function observe(subject, topic, data) {
        if (topic == "nsPref:changed")
        {
          if (data.match(".disabled$")) {
            try {
              var Enabled = prefBranch.getBoolPref(data);
            } catch (ex) {
              var Enabled = true;
            }
            data = data.replace(/.disabled$/, "");
            var dataArray = data.split(".");
            var Verb = decodeURI(dataArray[0]);
            dataArray.splice(0,1);
            var Host = dataArray.join(".");
            try {
              services[Verb][Host].Enabled = !Enabled;
            } catch (ex) {
//              alert(Verb);
            }
          }
        }
      }
    }
    prefBranch.QueryInterface(Components.interfaces.nsIPrefBranch2);
    try {
      prefBranch.addObserver("", prefObserver, false);
    } catch (ex) {
    }

    var observerService = Components.classes["@mozilla.org/observer-service;1"]
                          .getService(Components.interfaces.nsIObserverService);

    uninstallObserver = {
      observe: function observe(subject, topic, data) {
		if (topic == "em-action-requested") {
		  subject.QueryInterface(Components.interfaces.nsIUpdateItem);
	  
		  if (subject.id == "activities@kaply.com") {
			if (data == "item-uninstalled") {
              gBrowser.selectedTab = gBrowser.addTab("http://kaply.com/activities/uninstall");
			}
		  }
		}
	  }
    }



   observerService.addObserver(uninstallObserver, "em-action-requested", false); 

    openServiceObserver = {
      observe: function observe(subject, topic, data) {
        switch (data) {
        case "add":
        case "delete":
          reloadActions();
          break;
        }
      }
    }
    try {
      observerService.addObserver(openServiceObserver, "openService", false);
    } catch (ex) {
    }
    /* Event listener so we can modify the page context menu */
    var menu = document.getElementById("contentAreaContextMenu");
    menu.addEventListener("popupshowing", contextPopupShowing, false);
    menu.addEventListener("popuphiding", contextPopupHiding, false);
    menu.addEventListener("mouseover", delayHidePreview, false);

    var menupopup = document.getElementById("activities-menupopup");
    menupopup.addEventListener("popupshowing", contextPopupShowing, false);

    var previewpanel = document.getElementById("activities-preview-panel");
    previewpanel.addEventListener("popuphiding", previewWindowHiding, false);
    previewpanel.addEventListener("click", previewWindowClick, false);

    function detectPageLoad(event) {
	           var doc = event.originalTarget;
        if (content.document != doc) {
          return;
        }
        var ioService = Components.classes["@mozilla.org/network/io-service;1"].
                                      getService(Components.interfaces.nsIIOService);
        var uri = ioService.newURI(doc.location.href, null, null);
		try {
		  if (!uri.host.match("ieaddons.com")) {
		    return;
		  }
		} catch (ex) {
		  return;
		}
		var acceluri = uri.scheme + '://' + uri.host + '/' + uri.path.split('/')[1] + '/';
		
		var buttons = doc.getElementsByTagName("button");
		for (var i=0; i < buttons.length; i++) {
		  if (buttons[i].className == "installbtn") {
			var onclick = buttons[i].getAttribute("onclick");
			if (onclick.match("downloadResource")) {
			  var button_text = buttons[i].textContent;
			  button_text = button_text.replace("Internet Explorer", "Firefox");
			  buttons[i].textContent = button_text;
			  onclick = onclick.replace("nitobi.downloadResource(", "");
			  var resID = onclick.split(',')[0];
			  var new_onclick = "window.external.addService('" + acceluri + "DownloadHandler.ashx?ResourceId=" + resID + "');return false;";
			  buttons[i].setAttribute("onclick", new_onclick);
			}
		  }
		}
	}
    var appcontent = document.getElementById("appcontent");   // browser
    if (appcontent) {
      appcontent.addEventListener("DOMContentLoaded", detectPageLoad, true);
    }
  }
  function hidemenu() {
    if (dontHide) {
      dontHide = false;
      return;
    }
    internalHide = true;
    hideContextMenuTimerID = 0;
    document.getElementById("contentAreaContextMenu").hidePopup();
    internalHide = false
  }
  /* This function handles the window closing piece, removing listeners and observers */
  function shutdown()
  {
    prefBranch.removeObserver("", prefObserver, false);
    var observerService = Components.classes["@mozilla.org/observer-service;1"]
                            .getService(Components.interfaces.nsIObserverService);
    observerService.removeObserver(openServiceObserver, "openService");

    /* Remove page context menu listener */
    var menu = document.getElementById("contentAreaContextMenu");
    menu.removeEventListener("popupshowing", contextPopupShowing, false);
    menu.removeEventListener("mouseover", delayHidePreview, false);
    menu.removeEventListener("popuphiding", contextPopupHiding, false);

    var menupopup = document.getElementById("activities-menupopup");
    menupopup.removeEventListener("popupshowing", contextPopupShowing, false);

    var previewpanel = document.getElementById("activities-preview-panel");     
    previewpanel.removeEventListener("popuphiding", previewWindowHiding, false);
    previewpanel.removeEventListener("click", previewWindowClick, false);
  }
  /* if it is a post, set src to about:blank and do the post in the load listener */
  function iframeLoad() {
    return function(event) {
      var iframe = document.getElementById("activities-preview-iframe");
      if (iframe.activities_postData && iframe.activities_url) {
        var url = iframe.activities_url;
        var postData = iframe.activities_postData;
        delete iframe.activities_url;
        delete iframe.activities_postData;
        iframe.webNavigation.loadURI(url, 0, null, postData, null);
      }
    }
  }
  function encodeParam(instring, charset) {
    var outstring = textToSubURI.ConvertAndEscape(charset, instring);
    outstring = outstring.replace("%0D%0A", "+");
    outstring = outstring.replace("%0D", "+");
    outstring = outstring.replace("%0A", "+");
    return outstring;
  }
  function doSubstitution(instring, data, charset, type) {
    var newstring = instring;
    newstring = newstring.replace("{documentTitle}", encodeParam(data.documentTitle, charset));
    newstring = newstring.replace("{documentTitle?}", encodeParam(data.documentTitle, charset));
    newstring = newstring.replace("{documentUrl}", encodeParam(data.documentUrl, charset));
    newstring = newstring.replace("{documentUrl?}", encodeParam(data.documentUrl, charset));
    if (data.context == "selection") {
      if (type  && (type == "html")) {
        newstring = newstring.replace("{selection}", encodeParam(data.selectionHTML, charset));
        newstring = newstring.replace("{selection?}", encodeParam(data.selectionHTML, charset));
      } else {
        newstring = newstring.replace("{selection}", encodeParam(data.selection, charset));
        newstring = newstring.replace("{selection?}", encodeParam(data.selection, charset));
      }
    }
    if (data.context == "link") {
      newstring = newstring.replace("{linkText}", encodeParam(data.linkText, charset));
      newstring = newstring.replace("{linkText?}", encodeParam(data.linkText, charset));
      newstring = newstring.replace("{linkTitle}", encodeParam(data.linkText, charset));
      newstring = newstring.replace("{linkTitle?}", encodeParam(data.linkText, charset));
      newstring = newstring.replace("{link}", encodeParam(data.link, charset));
      newstring = newstring.replace("{link?}", encodeParam(data.link, charset));
    }
    return newstring;
  }
  function executeClick(event) {
    execute(event, {click:true});
  }
  function executePreview(event) {
    execute(event, {preview:true});
  }
  function execute(event, options) {
    if (options) {
      var preview = options.preview;
      var click = options.click;
    }
    if (preview && !document.getElementById("activities-preview-panel")) {
      return;
    }

    /* Only handle click in the middle button case */
    if (click && (event.button != 1)) {
      return;
    }
    var activity = event.target.activity;
    if (preview) {
      if (hidePreviewTimerID) {
        window.clearTimeout(hidePreviewTimerID);
      }
      if (!event.target.action.HasPreview) {
        hidePreviewWindow()
        return;
      }
      var action = event.target.action.preview;
    } else {
      var action = event.target.action.execute;
    }
    var query = "";
    for (let i=1; i <= action.ParamCount; i++) {
      /* If we are not the first parameter, add an ampersand */
      if (query.length != 0) {
        query += "&";
      }
      var Value = doSubstitution(action["Parameter"+i].Value, activity, action["Accept-charset"], action["Parameter"+i].Type);
      if (Value.length > 0) {
        query += action["Parameter"+i].Name;
        query += "=";
        query += Value;
      }
    }
    var url = doSubstitution(action.Action, activity, action["Accept-charset"]);
    if (action.Method.toLowerCase() == "post") {
      var stringStream =  Components.classes["@mozilla.org/io/string-input-stream;1"].
                                     createInstance(Components.interfaces.nsIStringInputStream);
      var postData = Components.classes["@mozilla.org/network/mime-input-stream;1"].
                                createInstance(Components.interfaces.nsIMIMEInputStream);
      if (action.Enctype) {
		if (action.Enctype == "multipart/form-data") {
          var boundary = '---------------------------';
		  boundary += Math.floor(Math.random()*32768);
		  boundary += Math.floor(Math.random()*32768);
		  boundary += Math.floor(Math.random()*32768);
          postData.addHeader("Content-Type", 'multipart/form-data; boundary=' + boundary);
		  var body = '';
		  for (let i=1; i <= action.ParamCount; i++) {
			var Value = doSubstitution(action["Parameter"+i].Value, activity, action["Accept-charset"], action["Parameter"+i].Type);
			if (Value.length > 0) {
			  body += '--' + boundary + '\r\n' + 'Content-Disposition: form-data; name="';
			  body += action["Parameter"+i].Name;
			  body += '"\r\n\r\n';
			  body += Value;
			  body += '\r\n'
			}
		  }
		  body += '--' + boundary + '--';
		  stringStream.data = body;
		} else {
          postData.addHeader("Content-Type", action.Enctype);
		}
      } else {
        postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
      }
	  if (action.Enctype != "multipart/form-data") {
        stringStream.data = query;
	  }
	  
      postData.addHeader("Accept-Charset", action["Accept-charset"]);
      postData.addContentLength = true;
      postData.setData(stringStream);
    } else {
      if (query.length > 0) {
        if (!action.Action.match(/\?/)) {
          url += "?";
        } else {
          url += "&";
        }
        url += query;
      }
    }
    if (preview) {
      /* Open temp window with preview url */
      var contextmenu = event.target.parentNode;
      var iframe = document.getElementById("activities-preview-iframe");
      if (iframe) {
        if (action.Method.toLowerCase() == "post") {
          if (iframe.webNavigation) {
            iframe.webNavigation.loadURI(action.Action,
                           0,
                           null,
                           postData,
                           null);

          } else {
            iframe.activities_postData = postData;
            iframe.activities_url = action.Action;
            iframe.addEventListener("DOMContentLoaded", iframeLoad, false);
          }
        } else {
          iframe.src = url;
          iframe.setAttribute("src", iframe.src);
        }
      }
      var popup = document.getElementById("activities-preview-panel");
      if (popup) {
        if (popup.nodeName.toLowerCase() == "panel") {
          popup.width = 326;
          popup.height = 246;
//          popup.showPopup(contextmenu, 0,
//                          0, "popup");
          popup.openPopup(contextmenu, "end_after", 0, 0, false, null);
        } else {
          popup.showPopup(contextmenu, event.screenX,
                          event.screenY-25, "popup");
        }
      }
    } else {
      if (action.Method.toLowerCase() == "post") {
        openUILinkIn(url, "tab", false, postData);
      } else {
        openUILinkIn(url, "tab");
      }
      if (click) {
        closeMenus(event.target);
      }
    }
  }
  function previewWindowClick(event) {
    if ((event.target.nodeName == "A") &&
        event.target.hasAttribute("target") &&
        (event.target.getAttribute("target") == "_blank")) {
	  openUILinkIn(event.target.getAttribute("href"), "tab");
      hidePreviewWindow();
      document.getElementById("contentAreaContextMenu").hidePopup();
	  event.preventDefault();
    } else {
      if (hideContextMenuTimerID) {
        dontHide = true;
        window.clearTimeout(hideContextMenuTimerID);
        hideContextMenuTimerID = 0;
      }
    }
  }
  function previewWindowHiding(event) {
    if (!event.target.timeout || (event.target.timeout == false)) {
      var menu = document.getElementById("contentAreaContextMenu");
//      menu.hidePopup();
    }
    event.target.timeout = false;
  }
  function hidePreviewWindow() {
    if (document.getElementById("activities-preview-panel").state != "open") {
      return;
    }
    if (previewTimerID) {
      window.clearTimeout(previewTimerID);
    }
    var popup = document.getElementById('activities-preview-panel');
    if (popup) {
      popup.timeout = true;
      popup.hidePopup()
    }
    var iframe = document.getElementById("activities-preview-iframe");
    if (iframe) {
      iframe.src = "about:blank";
      iframe.setAttribute("src", iframe.src);
    }
  }
  function delayHidePreview(event) {
    if ((event.target.id == "contentAreaContextMenu") ||
        (event.target.id == "activities-menupopup")) {
      return;
    }

    /* Should we check to make sure the node involved is microformat related ? */
    if (document.getElementById("activities-preview-panel").state != "open") {
      return;
    }
    if (hidePreviewTimerID) {
      window.clearTimeout(hidePreviewTimerID);
    }
    hidePreviewTimerID = window.setTimeout(function () {hidePreviewWindow();}, 500);
  }
  function delayPreview(event) {
    /* Should we check to make sure the node involved is microformat related ? */
    if (previewTimerID) {
      window.clearTimeout(previewTimerID);
    }
    previewTimerID = window.setTimeout(function () {executePreview(event);}, 500);
  }
  function isAdr(node) {
    if (typeof(Microformats) == "undefined") {
      return false;
    }

    var mfNode;
    if (Microformats.isMicroformat(node)) {
      mfNode = node;
    } else {
      mfNode = Microformats.getParent(node);
    }
    if (mfNode) {
      if (Microformats.matchClass(mfNode, "adr")) {
        return mfNode;
      }
    }
    return false;
  }
  
  function executeSearchClick(event) {
    executeSearch(event, {click:true});
  }
  
  function executeSearch(event, options) {
    if (options) {
      var click = options.click;
    }
  
    /* Only handle click in the middle button case */
    if (click && (event.button != 1)) {
      return;
    }
    var selection = event.target.activity.selection;
    var engine = event.target.engine;
    var submission = engine.getSubmission(selection, null);
    /* Might want to handle postData someday */
    openUILinkIn(submission.uri.spec, "tab");
    if (click) {
      closeMenus(event.target);
    }
  }
  
  function addSearch(engine, data, menu, event) {
    var tempMenu = document.createElement("menuitem");
    tempMenu.label = searchWithString.replace(/%S/,engine.name);
    tempMenu.setAttribute("label", tempMenu.label);
    if (engine.iconURI) {
      tempMenu.image = engine.iconURI.spec;
      tempMenu.setAttribute("image", tempMenu.image);
    }
    tempMenu["class"] = "menuitem-iconic";
    tempMenu.setAttribute("class", tempMenu["class"]);
    tempMenu.activity = data;
    tempMenu.engine = engine;
    tempMenu.addEventListener("command",
                              executeSearch,
                              true);
    tempMenu.addEventListener("click", executeSearchClick, true);
    event.target.insertBefore(tempMenu, menu);
    return true;
  }
  function addMenu(activity, data, popupContext, menu, event) {
    for (let j=1; j <= activity.ActionCount; j++) {
      if (activity["Action"+j].Context == popupContext) {
        var tempMenu = document.createElement("menuitem");
        tempMenu.label = activity.DisplayName;
        tempMenu.setAttribute("label", tempMenu.label);
        if (activity.Icon) {
          tempMenu.image = activity.Icon;
          tempMenu.setAttribute("image", tempMenu.image);
        }
        tempMenu["class"] = "menuitem-iconic";
        tempMenu.setAttribute("class", tempMenu["class"]);
        tempMenu.activity = data;
        tempMenu.action = activity["Action"+j];
        tempMenu.addEventListener("command",
                                  execute,
                                  true);
        tempMenu.addEventListener("click", executeClick, true);
        tempMenu.addEventListener("mouseover",
                                  delayPreview,
                                  true);
        tempMenu.addEventListener("mouseout",
                                  function(event){ if (previewTimerID) window.clearTimeout(previewTimerID);},
                                  true);
        event.target.insertBefore(tempMenu, menu);
        return true;
      }
    }
    return false;
  }
  function contextPopupHiding(event) {
    if (event.originalTarget == event.currentTarget) {
      if (document.getElementById("activities-preview-panel").state == "open") {
        if (!internalHide) {
          event.preventDefault();
          event.stopPropagation();
          if (hideContextMenuTimerID) {
            window.clearTimeout(hideContextMenuTimerID);
          }
          hideContextMenuTimerID = window.setTimeout(function () {hidemenu();}, 250);
        } else {
          hidePreviewWindow();
        }
      }
    }
  }
  function contextPopupShowing(event) {
    if ((event.target.id != "contentAreaContextMenu") && (event.target.id != "activities-menupopup")) {
      return;
    }

    if (event.target.id == "contentAreaContextMenu") {
      /* Remove existing menuitems */
      var separator = document.getElementById("activities-separator");
      while (separator.nextSibling && (separator.nextSibling.id != "activities-menu")) {
        separator.nextSibling.removeEventListener("command", execute, true);
        separator.nextSibling.removeEventListener("command", executeSearch, true);
        separator.nextSibling.removeEventListener("click", executeClick, true);
        separator.nextSibling.removeEventListener("click", executeSearchClick, true);
        separator.nextSibling.removeEventListener("mouseover", delayPreview, true);
        separator.nextSibling.parentNode.removeChild(separator.nextSibling);
      }
    } else {
      var menupopup = event.target;
      for(let i=menupopup.childNodes.length - 1; i >= 0; i--) {
        if ((menupopup.childNodes.item(i).id != "find-more-activities") &&
             (menupopup.childNodes.item(i).id != "manage-activities") &&
             (menupopup.childNodes.item(i).id != "recommend-kallout")) {
          menupopup.removeEventListener("command", execute, true);
          menupopup.removeEventListener("command", executeSearch, true);
          menupopup.removeEventListener("click", executeClick, true);
          menupopup.removeEventListener("click", executeSearchClick, true);
          menupopup.removeEventListener("mouseover", delayPreview, true);
          menupopup.removeChild(menupopup.childNodes.item(i));
        }
      }
    }
    
    if ((gContextMenu.onImage) || (gContextMenu.onTextInput)) {
      document.getElementById("activities-separator").hidden = true;;
      document.getElementById("activities-menu").hidden = true;
      return;
    } else {
      document.getElementById("activities-separator").hidden = false;
      document.getElementById("activities-menu").hidden = false;
    }

    /* context can be selection, document or link */
    var popupContext;
    var data = {};
    var mfNode;
    if (gContextMenu.onLink) {
      popupContext = "link";
      data.link = gContextMenu.linkURL;
      data.linkText = gContextMenu.linkText.call(gContextMenu);
    } else if (gContextMenu.isContentSelection()) {
      popupContext = "selection";
      var selection = document.commandDispatcher.focusedWindow.getSelection();
      data.selection = selection.toString();
      var div = content.document.createElement("div");
      div.appendChild(selection.getRangeAt(0).cloneContents());
      data.selectionHTML = div.innerHTML;
//    } else if (mfNode = isAdr(gContextMenu.target)) {
//      data.microformat =  new adr(mfNode);
//      popupContext = "adr";
    } else {
      popupContext = "document";
    }
    data.documentTitle = content.document.title;
    data.documentUrl = content.document.location.href;
    data.context = popupContext;

    var ss = Components.classes["@mozilla.org/browser/search-service;1"]
                       .getService(Components.interfaces.nsIBrowserSearchService);

    if (event.target.id == "contentAreaContextMenu") {
      var prevService;
      var addedSearch = false;
      for (let i in services) {
        try {
          var DefaultActivity = prefBranch.getCharPref(encodeURI(i) + ".DefaultActivity");
          /* If the activity isn't enabled, ignore it */
          if (!services[i][DefaultActivity].Enabled) {
            continue;
          }
          if (!addedSearch && (popupContext == "selection") && (searchWithString < i)) {
            if (!prevService || (searchWithString > prevService)) {
              addSearch(ss.defaultEngine, data, document.getElementById("activities-menu"), event);
              addedSearch = true;
            }
          }
          addMenu(services[i][DefaultActivity], data, popupContext,
                  document.getElementById("activities-menu"), event);
          prevService = i;
        } catch (ex) {
          /* No default activity specified for this activity category */
        }
      }
      
      if ((popupContext == "selection")  && !addedSearch) {
        addSearch(ss.defaultEngine, data, document.getElementById("activities-menu"), event);
      }
    } else {
      var prevService;
      var addedSearch = false;
      for (let i in services) {
        var addSeparator = false;
          if (!addedSearch && (popupContext == "selection") && (searchWithString < i)) {
            if (!prevService || (searchWithString > prevService)) {
              /* Enumerate through search services and add each */
              var engines = ss.getVisibleEngines({ });
              for (let j=0; j < engines.length; j++) {
                addSearch(engines[j], data, document.getElementById("find-more-activities"), event);
              }
              event.target.insertBefore(document.createElement("menuseparator"),
                                        document.getElementById("find-more-activities"));
              addedSearch = true;
            }
          }
        for (let activity_name in services[i]) {
          var activity = services[i][activity_name];
          if (!activity.Enabled) {
            continue;
          }
          addSeparator = addMenu(activity, data, popupContext,
                                 document.getElementById("find-more-activities"), event);
        }
        if (addSeparator) {
          prevService = i;
          event.target.insertBefore(document.createElement("menuseparator"),
                                    document.getElementById("find-more-activities"));
        }
      }
      if ((popupContext == "selection")  && !addedSearch) {
        /* Enumerate through search services and add each */
        var engines = ss.getVisibleEngines({ });
        for (let j=0; j < engines.length; j++) {
          addSearch(engines[j], data, document.getElementById("find-more-activities"), event);
        }
        event.target.insertBefore(document.createElement("menuseparator"),
                                  document.getElementById("find-more-activities"));
      }
    }
  }
  
  function dump(message) {
    var consoleService = Components.classes["@mozilla.org/consoleservice;1"].
                                    getService(Components.interfaces.nsIConsoleService);
    var scriptError = Components.classes["@mozilla.org/scripterror;1"].
                                 createInstance(Components.interfaces.nsIScriptError);
    scriptError.init("Activities: " + message, content.document.location.href, null, 0, 
                     null, 0, 0);
    consoleService.logMessage(scriptError);
  }
  
//  /* Attempt to use the Microformats module if available (Firefox 3) */
//  if (Components.utils.import) {
//    try {
//      Components.utils.import("resource:///modules/Microformats.js");
//    } catch (ex) {
//      /* Unable to load system Microformats - no microformats support */
//    }
//  }

  migrate();
  prefBranch = Components.classes["@mozilla.org/preferences-service;1"].
                               getService(Components.interfaces.nsIPrefService).
                               getBranch("extensions.activities.");
  textToSubURI = Components.classes["@mozilla.org/intl/texttosuburi;1"]
                           .getService(Components.interfaces.nsITextToSubURI);
   ioService = Components.classes["@mozilla.org/network/io-service;1"]
                         .getService(Components.interfaces.nsIIOService);


  var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                         .getService(Components.interfaces.nsIStringBundleService)
                         .createBundle("chrome://msft_activities/locale/activities.properties");
  try {
    searchWithString = bundle.GetStringFromName("searchWithString");
  } catch (ex) {
    searchWithString = "Search with %S";
  }


  reloadActions();
  /* Attach listeners for page load */ 
  window.addEventListener("load", startup, false);
  window.addEventListener("unload", shutdown, false);
})();

