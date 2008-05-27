var prefBranch;
var bundle;

function onLoad()
  {
    var sbs = Components.classes["@mozilla.org/intl/stringbundle;1"]
                        .getService(Components.interfaces.nsIStringBundleService	);
    this.bundle = sbs.createBundle("chrome://msft_activities/locale/activities.properties");

    this.prefBranch = Components.classes["@mozilla.org/preferences-service;1"].
                                 getService(Components.interfaces.nsIPrefService).
                                 getBranch("extensions.activities.");

    const MODE_RDONLY   = 0x01;

    const PERMS_FILE      = 0644;

    var usdir = Components.classes["@mozilla.org/file/directory_service;1"].
                            getService(Components.interfaces.nsIProperties).
                            get("ProfD", Components.interfaces.nsILocalFile);
    usdir.append("services");

    if (!usdir.exists()) {
      usdir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
    }
    var main_treechildren = document.createElement("treechildren");
    if (usdir.isDirectory()) {
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
            fileInStream.init(sourcefile, MODE_RDONLY, PERMS_FILE, false);
            var doc = domParser.parseFromStream(fileInStream, "UTF-8",
                                                sourcefile.fileSize,
                                               "text/xml");
            fileInStream.close();
            var display = doc.getElementsByTagName("display")[0]
            var homepageUrl = doc.getElementsByTagName("homepageUrl")[0]
            var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);	  
            var activity = doc.getElementsByTagName("activity")[0]
            var name = display.getElementsByTagName("name")[0].textContent.replace(/^\s*|\s*$/g,'');
            var category = activity.getAttribute("category").replace(/^\s*|\s*$/g,'');
            var host = ioService.newURI(homepageUrl.textContent.replace(/^\s*|\s*$/g,''), null, null).host;
            if (!main_treecell || main_treecell.getAttribute("label") != category) {
              var main_treeitem = document.createElement("treeitem");
              main_treeitem.setAttribute("container", "true");
              main_treeitem.setAttribute("open", "true");
              var main_treerow = document.createElement("treerow");
              var main_treecell = document.createElement("treecell");
              var sub_treechildren = document.createElement("treechildren");
              main_treecell.setAttribute("label", category);
            }
            var sub_treeitem = document.createElement("treeitem");
            sub_treeitem.setAttribute("host", host);
            sub_treeitem.setAttribute("category", category);
            var sub_treerow = document.createElement("treerow");
            var sub_treecell = document.createElement("treecell");
            sub_treecell.setAttribute("label", name);
            sub_treerow.appendChild(sub_treecell);
            var sub_treecell = document.createElement("treecell");
            sub_treecell.setAttribute("label", host);
            sub_treerow.appendChild(sub_treecell);
            var sub_treecell = document.createElement("treecell");
            sub_treecell.setAttribute("label", category);
            sub_treerow.appendChild(sub_treecell);
            var sub_treecell = document.createElement("treecell");
            try {
              /* disabled is only set if it is true */
              var disabled = this.prefBranch.getBoolPref(category + "." + host + ".disabled");
              sub_treecell.setAttribute("label", bundle.GetStringFromName("disabledLabel"));
            } catch (ex) {
              try {
                var defaultActivity = this.prefBranch.getCharPref(category + ".DefaultActivity");
              } catch (ex) {
              }
              if (defaultActivity == host) {
                sub_treecell.setAttribute("label", bundle.GetStringFromName("defaultLabel"));
              } else {
                sub_treecell.setAttribute("label", bundle.GetStringFromName("enabledLabel"));
              }
            }
            sub_treerow.appendChild(sub_treecell);
            sub_treeitem.appendChild(sub_treerow);

            sub_treechildren.appendChild(sub_treeitem);
            main_treerow.appendChild(main_treecell);
            main_treeitem.appendChild(main_treerow);
            main_treeitem.appendChild(sub_treechildren);
            main_treechildren.appendChild(main_treeitem);
        }
      }
      
          var tree = document.getElementById("activities-tree")

      tree.appendChild(main_treechildren);

    }
  }
  
  function onSetDefault() {
    var tree = document.getElementById('activities-tree');
    var treeitem = tree.view.getItemAtIndex(tree.currentIndex);
    var host = treeitem.getAttribute("host");
    var category = treeitem.getAttribute("category");
    
    try {
      var defaultActivity = prefBranch.getCharPref(category + ".DefaultActivity");
    } catch (ex) {
    }
    
    if (defaultActivity == host) {
      this.prefBranch.clearUserPref(category + ".DefaultActivity");
      try {
        var Enabled = !(this.prefBranch.getBoolPref(category + "." + host + ".disabled"));
      } catch (ex) {
        var Enabled = true;
      }
      if (Enabled) {
        treeitem.getElementsByTagName("treecell")[3]
                .setAttribute("label", bundle.GetStringFromName("enabledLabel"));
      } else {
        treeitem.getElementsByTagName("treecell")[3]
                .setAttribute("label", bundle.GetStringFromName("disabledLabel"));
      }
    } else {
      this.prefBranch.setCharPref(category + ".DefaultActivity", host);
      var treeitems = treeitem.parentNode.getElementsByTagName("treeitem");
      for (let i =0; i < treeitems.length; i++) {
         var curhost = treeitems[i].getAttribute("host");
         if (curhost == host) {
           treeitems[i].getElementsByTagName("treecell")[3]
                       .setAttribute("label", bundle.GetStringFromName("defaultLabel"));
         } else {
            try {
              var Enabled = !(this.prefBranch.getBoolPref(category + "." + curhost + ".disabled"));
            } catch (ex) {
              var Enabled = true;
            }
            if (Enabled) {
              treeitems[i].getElementsByTagName("treecell")[3]
                      .setAttribute("label", bundle.GetStringFromName("enabledLabel"));
            } else {
              treeitems[i].getElementsByTagName("treecell")[3]
                      .setAttribute("label", bundle.GetStringFromName("disabledLabel"));
            }
         }
      }
    }
    enableDisableButtons();
  }
  
  function onEnableDisable(event) {
    var tree = document.getElementById('activities-tree');
    var treeitem = tree.view.getItemAtIndex(tree.currentIndex);
    var host = treeitem.getAttribute("host");
    var category = treeitem.getAttribute("category");

    try {
      var Enabled = !(this.prefBranch.getBoolPref(category + "." + host + ".disabled"));
    } catch (ex) {
      var Enabled = true;
    }
    Enabled = !Enabled;

    if (Enabled) {
      try {
        this.prefBranch.clearUserPref(category + "." + host + ".disabled");
      } catch (ex) {
      }
      try {
        var defaultActivity = prefBranch.getCharPref(category + ".DefaultActivity");
      } catch (ex) {
      }
      if (defaultActivity == host) {
        treeitem.getElementsByTagName("treecell")[3]
                .setAttribute("label", bundle.GetStringFromName("defaultLabel"));
      } else {
        treeitem.getElementsByTagName("treecell")[3]
                .setAttribute("label", bundle.GetStringFromName("enabledLabel"));
      }
    } else {
      this.prefBranch.setBoolPref(category + "." + host + ".disabled", true);
      treeitem.getElementsByTagName("treecell")[3]
              .setAttribute("label", bundle.GetStringFromName("disabledLabel"));
    }
    enableDisableButtons();
  }

  function onDeleteActivity()
  {
    var tree = document.getElementById('activities-tree');
    var treeitem = tree.view.getItemAtIndex(tree.currentIndex);
    var host = treeitem.getAttribute("host");
    var category = treeitem.getAttribute("category");

    var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
                                   getService(Components.interfaces.nsIPromptService);
    var sure = promptService.confirm(window, this.bundle.GetStringFromName("activitiesTitle"), this.bundle.GetStringFromName("deleteConfirm"));
    if (sure) {
      var dest = Components.classes["@mozilla.org/file/directory_service;1"].
                            getService(Components.interfaces.nsIProperties).
                            get("ProfD", Components.interfaces.nsILocalFile);
      dest.append("services");
      dest.append(category + "_" + host + ".xml");
      try {
        dest.remove(true);
      } catch(ex) {}
      /* Some day try to get the right extension */
      dest.leafName = category + "_" + host + ".ico";
      try {
        dest.remove(true);
      } catch(ex) {}

      try {
        this.prefBranch.clearUserPref(category + "." + host + ".disabled");
      } catch (ex) {
      }
      try {
        var defaultActivity = prefBranch.getCharPref(category + ".DefaultActivity");
      } catch (ex) {
      }
      if (defaultActivity == host) {
        this.prefBranch.clearUserPref(category + ".DefaultActivity");
      }
      if (treeitem.parentNode.childNodes.length == 1) {
        treeitem.parentNode.parentNode.parentNode.removeChild(treeitem.parentNode.parentNode);
      } else {
        treeitem.parentNode.removeChild(treeitem);
      }

      Components.classes["@mozilla.org/observer-service;1"]
                .getService(Components.interfaces.nsIObserverService)
                .notifyObservers(null, "openService", "delete");
      
      enableDisableButtons();
    }
  }

  function onOK()
  {
      Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService)
                                           .notifyObservers(null, "openService", "add");
  }
  
  function generatePopup()
  {
    var tree = document.getElementById('activities-tree');
    var host = tree.view.getItemAtIndex(tree.currentIndex).getAttribute("host");
    var category = tree.view.getItemAtIndex(tree.currentIndex).getAttribute("category");
    if (host) {
      try {
        /* disabled is only set if it is true */
        var disabled = prefBranch.getBoolPref(category + "." + host + ".disabled");
        document.getElementById("disable").hidden = true;
        document.getElementById("enable").hidden = false;
        document.getElementById("setdefault").hidden = true;
        document.getElementById("removedefault").hidden = true;
      } catch (ex) {
        document.getElementById("disable").hidden = false;
        document.getElementById("enable").hidden = true;
        try {
          var defaultActivity = prefBranch.getCharPref(category + ".DefaultActivity");
        } catch (ex) {
        }
        if (defaultActivity == host) {
          document.getElementById("setdefault").hidden = true;
          document.getElementById("removedefault").hidden = false;
        } else {
          document.getElementById("setdefault").hidden = false;
          document.getElementById("removedefault").hidden = true;
        }
      }
      return true;
    }
    return false;
  }

  function enableDisableButtons() {
    var tree = document.getElementById('activities-tree');
    if (tree.currentIndex != -1) {
      var host = tree.view.getItemAtIndex(tree.currentIndex).getAttribute("host");
      var category = tree.view.getItemAtIndex(tree.currentIndex).getAttribute("category");
    }
    if ((tree.currentIndex == -1) || (!host)) {
      document.getElementById("setdefault-button").hidden = true;
      document.getElementById("removedefault-button").hidden = true;
      document.getElementById("enable-button").hidden = true;
      document.getElementById("disable-button").hidden = true;
      document.getElementById("delete-button").hidden = true;
    } else {
      try {
        var Enabled = !(this.prefBranch.getBoolPref(category + "." + host + ".disabled"));
      } catch (ex) {
        var Enabled = true;
      }
      if (Enabled) {
        document.getElementById("enable-button").hidden = true;
        document.getElementById("disable-button").hidden = false;
        try {
          var defaultActivity = prefBranch.getCharPref(category + ".DefaultActivity");
        } catch (ex) {
        }
        if (defaultActivity == host) {
          document.getElementById("removedefault-button").hidden = false;
          document.getElementById("setdefault-button").hidden = true;
        } else {
          document.getElementById("removedefault-button").hidden = true;
          document.getElementById("setdefault-button").hidden = false;
        }
      } else {
        document.getElementById("enable-button").hidden = false;
        document.getElementById("disable-button").hidden = true;
        document.getElementById("setdefault-button").hidden = true;
        document.getElementById("removedefault-button").hidden = true;
      }
      document.getElementById("delete-button").hidden = false;
    }
  }

