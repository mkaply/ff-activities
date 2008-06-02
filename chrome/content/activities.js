(function () {
  var namespaceURI = "http://www.microsoft.com/schemas/openservicedescription/1.0";
  var eTLDService;
  var ioService;
  var prefBranch = null;
  var prefObserver;
  var openServiceObserver;
  var searchWithString;
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
      serviceObject.Enabled = !prefBranch.getBoolPref(encodeURIComponent(serviceObject.Verb) + "." + serviceObject.Domain + ".disabled");
    } catch (ex) {
      serviceObject.Enabled = true;
    }
    var activityActions = activity.getElementsByTagNameNS(namespaceURI, "activityAction");
    serviceObject.ActionCount = activityActions.length;
    for (let i=1; i<=activityActions.length; i++) {
      serviceObject["Action"+i] = {};
      serviceObject["Action"+i].Context = activityActions[i-1].getAttribute("context").replace(/^\s*|\s*$/g,'');
      if (activityActions[i-1].hasAttribute("domain")) {
        serviceObject["Action"+i].Domain = activityActions[i-1].getAttribute("domain").replace(/^\s*|\s*$/g,'');
      }
      var previews = activityActions[i-1].getElementsByTagNameNS(namespaceURI, "preview");
      if (previews.length > 0) {
        serviceObject["Action"+i].HasPreview = true;
        var preview = previews[0];
        serviceObject["Action"+i].preview = {};
        serviceObject["Action"+i].preview.Action = preview.getAttribute("action").replace(/^\s*|\s*$/g,'');
        if (preview.hasAttribute("accept-charset")) {
          serviceObject["Action"+i].preview["Accept-charset"] = preview.getAttribute("accept-charset").replace(/^\s*|\s*$/g,'');
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
        } else {
          var script = parameters[j-1].getElementsByTagNameNS(namespaceURI, "script");
          if (script.length > 0) {
            serviceObject["Action"+i].execute["Parameter"+j].Script = script[0].textContent;
          }
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
              alert(Verb);
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
      menu.addEventListener("popupshowing",
                            function(event){ contextPopupShowing(event)},
                            false);
    var menupopup = document.getElementById("activities-menupopup");
    menupopup.addEventListener("popupshowing",
                          function(event){ contextPopupShowing(event)},
                          false);
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
    menu.removeEventListener("popupshowing",
                             function(event){ contextPopupShowing(event)},
                             false);
    var menupopup = document.getElementById("activities-menupopup");
    menupopup.removeEventListener("popupshowing",
                          function(event){ contextPopupShowing(event)},
                          false);
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
        iframe.webNavigation.loadURI(url,
                                     0,
                                     null,
                                     postData,
                                     null);
      }

    }
  }
  function doSubstitution(instring, data, context, type) {
    var newstring = instring;
    newstring = newstring.replace("{documentTitle}", data.documentTitle);
    newstring = newstring.replace("{documentTitle?}", data.documentTitle);
    newstring = newstring.replace("{documentUrl}", data.documentUrl);
    newstring = newstring.replace("{documentUrl?}", data.documentUrl);
    if (context == "document") {
      return newstring;
    }
    if (context == "selection") {
      if (type == "html") {
        newstring = newstring.replace("{selection}", data.selectionHTML);
        newstring = newstring.replace("{selection?}", data.selectionHTML);
      } else {
        newstring = newstring.replace("{selection}", data.selection);
        newstring = newstring.replace("{selection?}", data.selection);
      }
      return newstring;
    }
    if (context == "link") {
      newstring = newstring.replace("{linkText}", data.linkText);
      newstring = newstring.replace("{linkText?}", data.linkText);
      newstring = newstring.replace("{linkTitle}", data.linkText);
      newstring = newstring.replace("{linkTitle?}", data.linkText);
      newstring = newstring.replace("{link}", data.link);
      newstring = newstring.replace("{link?}", data.link);
      return newstring;
    }
    if (data.microformat) {
      var semanticObject = data.context[context];
      var semanticObjectType = data.context[context].semanticType;
      for (property in Microformats[semanticObjectType].properties) {
        if (semanticObject[property]) {
          if (Microformats[semanticObjectType].properties[property].datatype == "microformat") {
            if (typeof semanticObject[property] == "object") {
              /* what should we do here - allow subprops? */
            }
          }
          if (Microformats[semanticObjectType].properties[property].plural) {
            if ((type == "html") && semanticObject[property].toHTML) {
              newstring = newstring.replace(RegExp('{' + property + '}', "g"), encodeURIComponent(semanticObject[property].toHTML().join(',')));
            } else {
              newstring = newstring.replace(RegExp('{' + property + '}', "g"), encodeURIComponent(semanticObject[property].join(',')));
            }
          } else {
            if ((type == "html") && semanticObject[property].toHTML) {
              newstring = newstring.replace(RegExp('{' + property + '}', "g"), encodeURIComponent(semanticObject[property].toHTML()));
            } else {
              newstring = newstring.replace(RegExp('{' + property + '}', "g"), encodeURIComponent(semanticObject[property]));
            }
          }
          if (Microformats[semanticObjectType].properties[property].subproperties) {
            for (subproperty in Microformats[semanticObjectType].properties[property].subproperties) {
              if (semanticObject[property][subproperty]) {
                if (Microformats[semanticObjectType].properties[property].subproperties[subproperty].plural) {
                  if ((type == "html") && semanticObject[property][subproperty].toHTML) {  
                    newstring = newstring.replace(RegExp('{' + property + '.' + subproperty + '}', "g"), encodeURIComponent(semanticObject[property][subproperty].toHTML().join(',')));
                  } else {
                    newstring = newstring.replace(RegExp('{' + property + '.' + subproperty + '}', "g"), encodeURIComponent(semanticObject[property][subproperty].join(',')));
                  }
                } else {
                  if ((type == "html") && semanticObject[property][subproperty].toHTML) {
                    newstring = newstring.replace(RegExp('{' + property + '.' + subproperty + '}', "g"), encodeURIComponent(semanticObject[property][subproperty].toHTML()));
                  } else {
                    newstring = newstring.replace(RegExp('{' + property + '.' + subproperty + '}', "g"), encodeURIComponent(semanticObject[property][subproperty]));
                  }
                 }
               } else {
                 newstring = newstring.replace(RegExp('{' + property + '.' + subproperty + '}', "g"), "");
               }
            } /* for (subproperty in Microformats[semanticObjectType].properties[property].subproperties) */
          }
        } else {
          newstring = newstring.replace(RegExp('{' + property + '}', "g"), "");
        }
      } /* for (property in Microformats[semanticObjectType].properties) */
    }
    return newstring;
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
    var context = event.target.context;
    if (preview) {
      if (!event.target.action.HasPreview) {
        var popup = document.getElementById("activities-preview-panel");
        if (popup) {
          popup.hidePopup();
        }
        var iframe = document.getElementById("activities-preview-iframe");
        if (iframe) {
          iframe.src = "about:blank";
          iframe.setAttribute("src", iframe.src);
        }
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
      if (action["Parameter"+i].Value) {
        var Value = doSubstitution(action["Parameter"+i].Value, activity, context, action["Parameter"+i].Type);
      } else if (action["Parameter"+i].Script) {
        // @MAK TODO - BETTER CONTEXT
        var s = Components.utils.Sandbox("about:blank");
        
        function addMFtoSandbox(semanticObject, s) {
          var semanticObjectType = semanticObject.semanticType;
          for (let property in Microformats[semanticObjectType].properties) {
            if (semanticObject[property]) {
              if ((Microformats[semanticObjectType].properties[property].datatype == "microformat") &&
                  (!Microformats[semanticObjectType].properties[property].microformat_property)){
                if (typeof semanticObject[property] == "object") {
                  if (Microformats[semanticObjectType].properties[property].plural) {
                    s[property] = [];
                    for (let i=0; i < semanticObject[property].length; i++) {
                      s[property][i] = {};
                      addMFtoSandbox(semanticObject[property][i], s[property][i])
                    }
                  } else {
                    s[property] = {};
                    addMFtoSandbox(semanticObject[property], s[property])
                  }
                }
              } else {
                s[property] = semanticObject[property];
                if (Microformats[semanticObjectType].properties[property].subproperties) {
                  for (let subproperty in Microformats[semanticObjectType].properties[property].subproperties) {
                    if (semanticObject[property][subproperty]) {
                      s[property][subproperty] = semanticObject[property][subproperty];
                     }
                  }
                }
              }
            }
          }
        }
        if (activity.microformat) {
          addMFtoSandbox(activity.context[context], s);
        }
        s.alert = function(foo) {alert(foo)};
        var Value = Components.utils.evalInSandbox(action["Parameter"+i].Script, s);
        Value = encodeURIComponent(Value);
      }
      if (Value && Value.length > 0) {
        query += action["Parameter"+i].Name;
        query += "=";
        query += Value;
      }
    }
    var url = doSubstitution(action.Action, activity, context);
    if (action.Method.toLowerCase() == "post") {
      var stringStream =  Components.classes["@mozilla.org/io/string-input-stream;1"].
                                     createInstance(Components.interfaces.nsIStringInputStream);
      if ("data" in stringStream) // Gecko 1.9 or newer
        stringStream.data = query;
      else // 1.8 or older
        stringStream.setData(query, query.length);

      var postData = Components.classes["@mozilla.org/network/mime-input-stream;1"].
                                createInstance(Components.interfaces.nsIMIMEInputStream);
      if (action.Enctype) {
        postData.addHeader("Content-Type", action.Enctype);
      } else {
        postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
      }
      if (action["Accept-charset"]) {
        postData.addHeader("Accept-Charset", action["Accept-charset"]);
      } else {
        postData.addHeader("Accept-Charset", "utf-8");
      }
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
            iframe.addEventListener("DOMContentLoaded", iframeLoad(), false);
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
          popup.showPopup(null, contextmenu.boxObject.screenX-popup.width,
                          event.screenY-25, "popup");
        } else {
          popup.showPopup(contextmenu, event.screenX,
                          event.screenY-25, "popup");
        }
      }
    } else {
      if (action.Method.toLowerCase() == "post") {
        openUILink(url, event, undefined, undefined, undefined, postData, undefined);
      } else {
        openUILink(url, event);
      }
      if (click) {
        closeMenus(event.target);
      }
    }
  }
  function isMicroformat(node) {
    if (typeof(Microformats) == "undefined") {
      return false;
    }

    var mfNode;
    if (Microformats.isMicroformat(node)) {
      mfNode = node;
    } else {
      mfNode = Microformats.getParent(node);
    }
    return mfNode;
  }
  
  function executeSearch(event, options) {
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
    if (preview) {
      var popup = document.getElementById("activities-preview-panel");
      if (popup) {
        popup.hidePopup();
      }
      var iframe = document.getElementById("activities-preview-iframe");
      if (iframe) {
        iframe.src = "about:blank";
        iframe.setAttribute("src", iframe.src);
      }
      return;
    }
    var selection = event.target.activity.selection;
    var engine = event.target.engine;
    var submission = engine.getSubmission(selection, null);
    /* Might want to handle postData someday */
    openUILink(submission.uri.spec, event);
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
                              function(event){executeSearch(event)},
                              true);
    tempMenu.addEventListener("click", function(event){executeSearch(event, {click:true})}, true);
    tempMenu.addEventListener("mouseover",
                              function(event){executeSearch(event, {preview:true})},
                              true);
    event.target.insertBefore(tempMenu, menu);
    return true;
  }
  function addMenu(activity, data, popupContext, menu, event) {
    for (let j=1; j <= activity.ActionCount; j++) {
      if (popupContext[activity["Action"+j].Context]) {
        if (activity["Action"+j].Domain) {
          if (eTLDService) {
            var pageHost = ioService.newURI(content.document.location.href, null, null);
            try {
              if (!eTLDService.getBaseDomain(pageHost).match(activity["Action"+j].Domain + "$")) {
                continue;
              }
            } catch (ex) {
              /* If getBaseDomain failed, probably a file URL */
              continue;
            }
          }
        }
        var tempMenu = document.createElement("menuitem");
        tempMenu.label = activity.DisplayName + " (" + activity["Action"+j].Context + ")";
        tempMenu.setAttribute("label", tempMenu.label);
        if (activity.Icon) {
          tempMenu.image = activity.Icon;
          tempMenu.setAttribute("image", tempMenu.image);
        }
        tempMenu["class"] = "menuitem-iconic";
        tempMenu.setAttribute("class", tempMenu["class"]);
        tempMenu.activity = data;
        tempMenu.action = activity["Action"+j];
        tempMenu.context = activity["Action"+j].Context;
        tempMenu.addEventListener("command",
                                  function(event){execute(event)},
                                  true);
        tempMenu.addEventListener("click", function(event){execute(event, {click:true})}, true);
        tempMenu.addEventListener("mouseover",
                                  function(event){execute(event, {preview:true})},
                                  true);
        event.target.insertBefore(tempMenu, menu);
        return true;
      }
    }
    return false;
  }
  function contextPopupShowing(event) {
    if ((event.target.id != "contentAreaContextMenu") && (event.target.id != "activities-menupopup")) {
      return;
    }

    if (event.target.id == "contentAreaContextMenu") {
      /* Remove existing menuitems */
      var separator = document.getElementById("activities-separator");
      while (separator.nextSibling && (separator.nextSibling.id != "activities-menu")) {
        separator.nextSibling.removeEventListener("command",
                                                  function(event){execute(event)},
                                                  true);
        separator.nextSibling.removeEventListener("click", function(event){execute(event, {click:true})}, true);
        separator.nextSibling.removeEventListener("mouseover",
                                                  function(event){execute(event, {preview:true})},
                                                  true);
        separator.nextSibling.parentNode.removeChild(separator.nextSibling);
      }
    } else {
      var menupopup = event.target;
      for(let i=menupopup.childNodes.length - 1; i >= 0; i--) {
        if ((menupopup.childNodes.item(i).id != "find-more-activities") &&
             (menupopup.childNodes.item(i).id != "manage-activities")) {
          menupopup.removeEventListener("command",
                                        function(event){execute(event)},
                                        true);
          menupopup.removeEventListener("click", function(event){execute(event, {click:true})}, true);
          menupopup.removeEventListener("mouseover",
                                    function(event){execute(event, {preview:true})},
                                    true);
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
    var popupContext = [];
    var data = {};
    var mfNode;
    if (gContextMenu.onLink) {
      popupContext["link"] = true;
      data.link = gContextMenu.linkURL;
      data.linkText = gContextMenu.linkText.call(gContextMenu);
    }
    if (gContextMenu.isContentSelection()) {
      popupContext["selection"] = true;
      var selection = document.commandDispatcher.focusedWindow.getSelection();
      data.selection = encodeURIComponent(selection.toString());
      var div = content.document.createElement("div");
      div.appendChild(selection.getRangeAt(0).cloneContents());
      data.selectionHTML = encodeURIComponent(div.innerHTML);
    }
    if ((mfNode = isMicroformat(gContextMenu.target))) {
      data.microformat = true;
      while (mfNode) {
        var mfNameString = Microformats.getNamesFromNode(mfNode);
        var mfNames = mfNameString.split(" ");
        for (i=0; i < mfNames.length; i++) {
          popupContext[mfNames[i]] = new Microformats[mfNames[i]].mfObject(mfNode, true);
        }
        mfNode = Microformats.getParent(mfNode);
      }
    }
    popupContext["document"] = true;
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
          if (!addedSearch && popupContext["selection"] && (searchWithString < i)) {
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
      
      if (popupContext["selection"]  && !addedSearch) {
        addSearch(ss.defaultEngine, data, document.getElementById("activities-menu"), event);
      }
    } else {
      var prevService;
      var addedSearch = false;
      for (let i in services) {
        var addSeparator = false;
        if (!addedSearch && popupContext["selection"] && (searchWithString < i)) {
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
      if (popupContext["selection"] && !addedSearch) {
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
  if (typeof(Microformats) == "undefined") {
//    objScriptLoader.loadSubScript("chrome://msft_activities/content/Microformats/Microformats.js");
  }

  migrate();
  prefBranch = Components.classes["@mozilla.org/preferences-service;1"].
                               getService(Components.interfaces.nsIPrefService).
                               getBranch("extensions.activities.");
  if (Components.interfaces.nsIEffectiveTLDService) {
    eTLDService = Components.classes["@mozilla.org/network/effective-tld-service;1"]
                            .getService(Components.interfaces.nsIEffectiveTLDService);
  }
  ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

  var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                         .getService(Components.interfaces.nsIStringBundleService)
                         .createBundle("chrome://msft_activities/locale/activities.properties");
  try {
    searchWithString = bundle.GetStringFromName("searchLabel");
  } catch (ex) {
    searchWithString = "Search with %S";
  }


  reloadActions();
  /* Attach listeners for page load */ 
  window.addEventListener("load", function(e)   { startup(); }, false);
  window.addEventListener("unload", function(e) { shutdown(); }, false);
})();

