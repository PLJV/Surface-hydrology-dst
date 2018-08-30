/**
 * @fileoverview Runs the Surface Hydrology Viewer application
 * Author(s): Kyle Taylor (kyle.taylor@pljv.org)
 * License: All PLJV additions are released as GPL v3
 * Copyright: Playa Lakes Joint Venture (2017)
 */

trendy = {};  // Our namespace.

/**
 * Starts the Trendy Lights application. The main entry point for the app.
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
 * @param {string} serializedPolygonIds A serialized array of the IDs of the
 *     polygons to show on the map. For example: "['poland', 'moldova']".
 */
trendy.boot = function(historicalEeMapId, mostRecentEeMapId, historicalEeToken, mostRecentEeToken) {
  // Load external libraries.
  google.load('visualization', '1.0');
  google.load('jquery', '1');
  //  this key has domain restrictions associated with it
  google.load('maps', '3', {'other_params': 'key=AIzaSyDraxoLomEu1kNGyDFpb6K-SU4FSmAFZWc&libraries=drawing'});
  // Create the Trendy Lights app.
  google.setOnLoadCallback(function() {
    //var mapType = trendy.App.getEeMapType(historicalEeMapId, historicalEeToken);
    trendy.App.historicalLayer = trendy.App.getEeMapType(historicalEeMapId, historicalEeToken);
    trendy.App.mostRecentLayer = trendy.App.getEeMapType(mostRecentEeMapId, mostRecentEeToken);
    // calls createMap() with our historical layer
    trendy.App(trendy.App.historicalLayer);
    trendy.App.addLayer(trendy.App.mostRecentLayer, id='mostRecent');
  });
  // initialize any lurking div elements for controls
  trendy.App.addGeocoderControl();
};


///////////////////////////////////////////////////////////////////////////////
//                               The application.                            //
///////////////////////////////////////////////////////////////////////////////



/**
 * The main Trendy Lights application.
 * This constructor renders the UI and sets up event handling.
 * @param {google.maps.ImageMapType} mapType The map type to render on the map.
 * @param {Array<string>} polygonIds The IDs of the polygons to show on the map.
 *     For example ['poland', 'moldova'].
 * @constructor
 */
trendy.App = function(mapType, polygonIds) {
  // Create and display the map.
  trendy.App.createMap(mapType);
  // Fix our default zoom levels
  // Add a move listener to restrict the bounds range
  trendy.App.map.addListener('center_changed', function() {
    trendy.App.checkBounds();
  });
};


/**
 * Creates a Google Map with a black background the given map type rendered.
 * The map is anchored to the DOM element with the CSS class 'map'.
 * @param {google.maps.ImageMapType} mapType The map type to include on the map.
 * @return {google.maps.Map} A map instance with the map type rendered.
 */
trendy.App.createMap = function(mapType) {
  // initialize our layers stack
  trendy.App.numLayers = 0;
  trendy.App.defaultMapOptions = {
    backgroundColor: '#00000',
    center: trendy.App.DEFAULT_CENTER,
    zoom: trendy.App.DEFAULT_ZOOM,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
    minZoom: 4,
    maxZoom: 17,
    scaleControl: true,
    drawingControl: false,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
              position: google.maps.ControlPosition.TOP_LEFT
    }
  };
                                 //Lower, Left                    //Upper, Right
  trendy.App.allowedBounds = new google.maps.
    LatLngBounds(new google.maps.LatLng(37,-102), new google.maps.LatLng(40.1,-94.58));

  var mapEl = $('.map').get(0);
  trendy.App.map = new google.maps.Map(mapEl, trendy.App.defaultMapOptions);

  trendy.App.map.setOptions({styles: trendy.App.BASE_MAP_STYLE});
  // add our 30 year historical imagery by default
  trendy.App.addLayer(mapType, is='historical');
  // now add the boundary for the state of Kansas
  trendy.App.map.data.loadGeoJson('static/kansas.json');
  trendy.App.map.data.setStyle({
    fillColor: 'white',
    fillOpacity:0,
    strokeColor: "#f7f7f7",
    strokeOpacity: 0.9,
    strokeWeight: 1
  })
  // add the drawing manager control
  trendy.App.addDrawingManagerControl();
};
/**
 * Add an additional layer to an existing map object
 */
 trendy.App.addLayer = function(mapType, id){
    trendy.App.map.overlayMapTypes.push(mapType);
    trendy.App.numLayers += 1
    if(id.includes("istor")){
      trendy.App.historicalLayer.at = (trendy.App.numLayers-1)
    } else if(id.includes("ost")) {
      trendy.App.mostRecentLayer.at = (trendy.App.numLayers-1)
    }
 }
 trendy.App.removeLayer = function(id){
   if(id.includes("istor")){
     trendy.App.map.overlayMapTypes.removeAt(trendy.App.historicalLayer.at);
     trendy.App.historicalLayer.at = null
     trendy.App.numLayers -= 1
     // if we still have the other layer on the map, adjust it's array pos
     if(trendy.App.mostRecentLayer.at){
       trendy.App.mostRecentLayer.at -= 1
     }
   } else if(id.includes("ost")){
     trendy.App.map.overlayMapTypes.removeAt(trendy.App.mostRecentLayer.at);
     trendy.App.mostRecentLayer.at = null
     trendy.App.numLayers -= 1
     // if we still have the other layer on the map, adjust it's array pos
     if(trendy.App.historicalLayer.at){
       trendy.App.historicalLayer.at -= 1
     }
   }
 }
/**
 * If the map position is out of range, move it back
 */
trendy.App.checkBounds = function() {
      // Perform the check and return if OK
      if (trendy.App.allowedBounds.contains(trendy.App.map.getCenter())) {
        return;
      }
      // If it`s not OK, find the nearest allowed point and move there
      var C = trendy.App.map.getCenter();
      var X = C.lng();
      var Y = C.lat();

      var AmaxX = trendy.App.allowedBounds.getNorthEast().lng();
      var AmaxY = trendy.App.allowedBounds.getNorthEast().lat();
      var AminX = trendy.App.allowedBounds.getSouthWest().lng();
      var AminY = trendy.App.allowedBounds.getSouthWest().lat();

      if (X < AminX) {X = AminX;}
      if (X > AmaxX) {X = AmaxX;}
      if (Y < AminY) {Y = AminY;}
      if (Y > AmaxY) {Y = AmaxY;}
      //alert ("Restricting "+Y+" "+X);
      trendy.App.map.panTo(new google.maps.LatLng(Y,X));
}

trendy.App.addDrawingManagerControl = function(show=false){
  // create some array space for any markers or polygons
  trendy.App.markers = [];
  trendy.App.polygons = [];
  // load our drawing manager interface
  trendy.App.drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: google.maps.drawing.OverlayType.MARKER,
    drawingControlOptions: {
      drawingModes: ['marker','polygon','rectangle'],
      position: google.maps.ControlPosition.TOP_CENTER,
    },
    markerOptions: { editable: true},
    polygonOptions: { editable: true},
    rectangleOptions: { editable: true}
  });
  // show method
  trendy.App.drawingManager.show = function(){
    trendy.App.map.setOptions({ drawingControl: true });
  }
  // hide method
  trendy.App.drawingManager.hide = function(){
    trendy.App.map.setOptions({ drawingControl: false });
  }
  google.maps.event.addListener(trendy.App.drawingManager, 'overlaycomplete', function(event) {
    if(event.type == google.maps.drawing.OverlayType.POLYGON | event.type == google.maps.drawing.OverlayType.RECTANGLE) {
      trendy.App.polygons.push(event.overlay);
    } else if(event.type == google.maps.drawing.OverlayType.MARKER) {
      trendy.App.markers.push(event.overlay);
    }
  });
  // by default, the drawing manager is hidden -- let's show it
  trendy.App.drawingManager.setMap(trendy.App.map);
  if(show){
    trendy.App.drawingManager.show();
  }
}

trendy.App.removeAllFeatures = function(){
  for (var i = 0; i < trendy.App.markers.length; i++) {
     trendy.App.markers[i].setMap(null);
  }
  for (var i = 0; i < trendy.App.polygons.length; i++) {
     trendy.App.polygons[i].setMap(null);
  }
}
/**
 * Create a marker from location services and pan the map to the user's current
 * location
 */
trendy.App.addInfoboxControl = function(controlDiv){
  var infoboxControl = document.createElement('div');
  myLocationControl.title = 'information';
  controlDiv.appendChild(infoboxControl);
  var controlText = document.createElement('div');
  controlText.innerHTML = 'information';
  controlUI.appendChild(controlText);
}

trendy.App.toggleInfobox = function(id='instructionsPopout'){
  // is the infobox currently displayed?
  if( document.getElementById(id).style.display === "" | document.getElementById(id).style.display === "block" ){
    // hide it
    document.getElementById(id).style.display = "none"
  // else: show it
  } else {
    document.getElementById(id).style.display = "block"
  }
}

trendy.App.addGeocoderControl = function(){
  geocoderSearchbox = window.document.querySelector(".geocoderSearchbox");
  // stylize our interface elements
  var search_textinput = document.createElement('input');
  search_textinput.type = "text";
  search_textinput.style.width = "100%";
  search_textinput.style.height = "100%";
  search_textinput.style.padding = "5px";
  search_textinput.style.padding = "0";
  search_textinput.style.boxSizing = "border-box";
  // append elements to div
  geocoderSearchbox.appendChild(search_textinput);
  geocoderSearchbox.style.display = "none";
}

trendy.App.toggleGeocoder = function(id='geocoderSearchbox', click_event='none'){
  // is the geocoder search box currently displayed?
  if( document.getElementById(id).style.display === "" | document.getElementById(id).style.display === "block" ){
    // hide it
    document.getElementById(id).style.display = "none"
  // else: show it and initiate a query
  } else {
    geocoderSearchbox = window.document.querySelector(".geocoderSearchbox");
    var left = click_event.clientX - 310;
    var top = click_event.clientY;
    // set the left / top of our searchbox using the mouse-click coords
    geocoderSearchbox.style.left = left + "px";
    geocoderSearchbox.style.top = top + "px";
    // show it
    geocoderSearchbox.style.display = "block";
  }
}

trendy.App.featuresToJson = function(featureCollection){
  coords = [ ] 
  for(i in length(featureCollection)){
    if (shapes[i] instanceof google.maps.Marker) {
      coords[i] = [
        { lat: featureCollection[i].getPosition().lat() },
        { lng:featureCollection[i].getPosition().lon() } ]
    } else if(shapes[i] instanceof google.maps.Polygon || featureCollection[i] instanceof google.maps.Rectangle) {

    }
  }
}
trendy.App.extractFeatures = function(assetId, featureCollection){
  assetId = 'users/adaniels/shared/LC5historicwetness_10m'
  featureCollection = ee.FeatureCollection(featureCollection)
  extractOperation = function(){
    ee.initialize()
    var asset  = ee.Image(assetId)
    var extracted = asset.reduceRegions(featureCollection, ee.Reducer.mean());

  }
  // attempt to authenticate and run our function
  ee.data.authenticate('104852534761357168165', extractOperation, null, null, null);
}
/**
 * Create a marker from location services and pan the map to the user's current
 * location
 */
trendy.App.addMyLocationControl = function(controlDiv){
  var myLocationControl = document.createElement('div');
  myLocationControl.title = 'Click to recenter the map';
  controlDiv.appendChild(myLocationControl);
  var controlText = document.createElement('div');
  controlText.innerHTML = 'Center Map';
  controlUI.appendChild(controlText);
}

trendy.App.addLocationMarker = function(panTo=true){
  // Add a marker and pan for the default 'go to my location' action
  var myLocationIcon = new google.maps.Marker({
    clickable: false,
    icon: new google.maps.MarkerImage('//maps.gstatic.com/mapfiles/mobile/mobileimgs2.png',
        new google.maps.Size(22,22),
        new google.maps.Point(0,18),
        new google.maps.Point(11,11)
      ),
      shadow: null,
      zIndex: 999,
      map: trendy.App.map
  });
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function(pos) {
      var me = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      myLocationIcon.setPosition(me);
      if(panTo){
        trendy.App.map.panTo(me);
        trendy.App.map.setZoom(14)
      }
  }, function(error) {
      console.log(error)
  });
}



///////////////////////////////////////////////////////////////////////////////
//                        Static helpers and constants.                      //
///////////////////////////////////////////////////////////////////////////////


/**
 * Generates a Google Maps map type (or layer) for the passed-in EE map id. See:
 * https://developers.google.com/maps/documentation/javascript/maptypes#ImageMapTypes
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
 * @return {google.maps.ImageMapType} A Google Maps ImageMapType object for the
 *     EE map with the given ID and token.
 */
trendy.App.getEeMapType = function(eeMapId, eeToken) {
  var eeMapOptions = {
    getTileUrl: function(tile, zoom) {
      var url = trendy.App.EE_URL + '/map/';
      url += [eeMapId, zoom, tile.x, tile.y].join('/');
      url += '?token=' + eeToken;
      return url;
    },
    tileSize: new google.maps.Size(256, 256)
  };
  return new google.maps.ImageMapType(eeMapOptions);
};


/** @type {string} The Earth Engine API URL. */
trendy.App.EE_URL = 'https://earthengine.googleapis.com';


/** @type {number} The default zoom level for the map. */
trendy.App.DEFAULT_ZOOM = 9;


/** @type {Object} The default center of the map. */
trendy.App.DEFAULT_CENTER = {lng: -98.38, lat: 38.48};

/**
 * @type {Array} An array of Google Map styles. See:
 *     https://developers.google.com/maps/documentation/javascript/styling
 */

trendy.App.BASE_MAP_STYLE = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#ebe3cd"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#523735"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#f5f1e6"
      }
    ]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#c9b2a6"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#dcd2be"
      }
    ]
  },
  {
    "featureType": "administrative.land_parcel",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#ae9e90"
      }
    ]
  },
  {
    "featureType": "landscape.natural",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "poi",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#93817c"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry.fill",
    "stylers": [
      {
        "color": "#a5b076"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#447530"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#f5f1e6"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#fdfcf8"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#f8c967"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#e9bc62"
      }
    ]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#e98d58"
      }
    ]
  },
  {
    "featureType": "road.highway.controlled_access",
    "elementType": "geometry.stroke",
    "stylers": [
      {
        "color": "#db8555"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#806b63"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#8f7d77"
      }
    ]
  },
  {
    "featureType": "transit.line",
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#ebe3cd"
      }
    ]
  },
  {
    "featureType": "transit.station",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#dfd2ae"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry.fill",
    "stylers": [
      {
        "color": "#b9d3c2"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#92998d"
      }
    ]
  }
];

///////////////////////////////////////////////////////////////////////////////
//                        Add-On: Message Pane (Carta)
///////////////////////////////////////////////////////////////////////////////

carta = { };

// excuse the hackish circa 1996 HTML formatting - KT

carta.DEFAULT_ABOUT_HTML =
    "<div class=\"header-top\">" +
    "  <h3>Surface Hydrology Viewer <sup><font color=\"#d89f22\">ALPHA</font></sup></h3>" +
    "</div>" +
    "<div class=\"scroll-box\">" +
    "Welcome to the Surface Hydrology Viewer!" +
    "<br><br>" +
    "This is a web application designed to help producers, private landowners, and biologists to identify and track" +
    "long-term patterns in surface water availability across Kansas. This website allows you to explore surface water" +
    "data in your browser or download and work with the data directly in a GIS." +
    "<br><br>" +
    "Tips on usage :" +
    "<ul>" +
    "  <li>You can <b>navigate the map</b> by left-clicking and holding with your mouse and then moving the mouse. If"+
    "  you are using a mobile device, you can accomplish the same gesture by pressing and drag the screen. You can"+
    "  also use the arrow keys on your keyboard.</li>" +
    "<li>You can <b>toggle the display layer(s)</b> for the “most recent wet scene” and the “long-term surface" +
    "  hydrology” products by using the <img src=\"/static/toggle_icon.png\" height=\"15px\"></img> icons in the" +
    "  legend on the lower-left hand side of the screen.</li>" +
    "<li>You can <b>zoom</b> in-and-out using the wheel on your mouse, or the <b>+</b> and <b>-</b> icons" +
    " located in the lower-right of the screen.</li>" +
    "<li>You can <b>zoom to the current geographic location</b> of your device by clicking the <img " +
    " src=\"/static/zoom_to_icon.png\" height=\"15px\"></img> control button in the lower-right hand side of the " +
    " screen.</li> " +
    " <li>You can <b>zoom to an area of interest</b> that is cached on Google Maps using the <img " +
    "   src=\"/static/zoom_to_place.png\" height=\"15px\"></img> control button in the lower-right hand side of the" +
    "   screen.</li>" +
    " <li>If you are using a desktop computer, you can use the drawing controls located at the top of the screen " +
    "   to <b>add markers or shapes around an area of interest</b>. After you’ve delineated an area, you can export " +
    "   map information by right-clicking on the viewer and using the context-menu to <b>export features</b>. By " +
    "   default, this will generate a comma-separated file (CSV) with summary data that you can download and open " +
    "   in spreadsheet software like LibreOffice, Excel, or ‘R’.</li>" +
    " <li>You can also use the <b>right-click</b> context menu to remove all features on the map, as well as hide" +
    "   interface elements like the legend and this help window.</li>" +
    "</ul>" +
    "For a demonstration walk-through on using this app, we’ve made you a handy YouTube video (see: external link)." +
    "</div>" +
    "<div class=\"bottom-buttons\">"+
    "<button type=\"button\" onclick=\"javascript:carta.hide();\" >hide</button>" +
    "<button type=\"button\" onclick=\"javascript:carta.changeMessage('instructionsPopout', carta.GOOGLE_TEAM_DRIVE_DOWNLOAD_HTML);\" >download data</button>" +
    "<button type='button' onclick=\"javascript:carta.changeMessage('instructionsPopout', carta.ABOUT_CONTACT_INFORMATION_HTML);\">about</button>" +
    "</div>";

carta.GOOGLE_TEAM_DRIVE_DOWNLOAD_HTML =
    "<div class=\"header-top\">" +
    "<h3>Download Processed Imagery</h3>" +
    "</div>" +
    "<div class='scroll-box'>" +
    "PLJV provides static and dynamic copies of the imagery data as GeoTIFF files that you can use in a GIS at the following URLs<br><br>" +
    "&nbsp;&nbsp;<b>&#8226;</b>&nbsp;&nbsp;<a target='_blank' href='https://drive.google.com/a/pljv.org/file/d/1DTNVtQEdwe8IgRgHWW38tcSqV50wky_1/view?usp=sharing'>Most Recent Wet Scene</a> (Google Drive)<br>" +
    "&nbsp;&nbsp;<b>&#8226;</b>&nbsp;&nbsp;<a target='_blank' href='https://drive.google.com/a/pljv.org/file/d/1efkVeaf8PRt-YCKStTM1JZiYB9GEMVnF/view?usp=sharing'>30 Year Historical Surface Wetness</a> (Google Drive)<br><br>" +
    "The source data for the web app are maintained as Google Earth Engine assets. If you use Google Earth Engine and you'd just like to <a target='_blank' href='https://developers.google.com/earth-engine/asset_manager#importing-assets-to-your-script'>import the assets</a> " + "directly into your code, here are the asset ID's:<br><br>" +
    "&nbsp;&nbsp;<b>&#8226;</b>&nbsp;&nbsp;'<a href='https://code.earthengine.google.com/?asset=users/kyletaylor/shared/LC8dynamicwater' target='_blank'>users/kyletaylor/shared/LC8dynamicwater</a>' (Most Recent Scene)<br>" +
    "&nbsp;&nbsp;<b>&#8226;</b>&nbsp;&nbsp;'<a href='https://code.earthengine.google.com/?asset=users/adaniels/shared/LC5historicwetness_10m' target='_blank'>users/adaniels/shared/LC5historicwetness_10m</a>' (30 Year Historical)<br>" +
    "</div>" +
    "<div class=\"bottom-buttons\">"+
    "<button type='button' onclick='javascript:carta.hide(\"instructionsPopout\");'>hide</button>" +
    "<button type='button' onclick='javascript:carta.changeMessage(\"instructionsPopout\",carta.DEFAULT_ABOUT_HTML);'>back to help</button>" +
    "<button type='button' onclick='javascript:carta.changeMessage(\"instructionsPopout\",carta.ABOUT_CONTACT_INFORMATION_HTML);'>about</button>" +
    "</div>";

carta.ABOUT_CONTACT_INFORMATION_HTML =
    "<div class=\"header-top\">" +
    "<h3>About</h3>" +
    "</div>" +
    "<div class='scroll-box'>" +
    "This map displays the current and historic distribution of surface water in the State of Kansas. Data from the " +
    "Landsat 8 satellite is used to map the current surface water extent in the state. Data from the Landsat 5 " +
    "platform was used to map the frequency of historic wetness from 1985 to 2012." +
    "<br><br>"+
    "The source code for this hydrology viewer is open source (GPLv3). If you are a developer and would like " +
    "to contribute to the project, report a bug, or fork it and make your own, you can get in touch with the " +
    "developers at PLJV using our GitHub project page.<br><br>" +
    "  • GitHub Project Page (External Site) <br>"+
    "  • About Playa Lakes Joint Venture (External Site) <br>"+
    "  • About NRCS (External Site)<br>"+
    "<br><br>" +
    "<img src=\"static/pljv_logo.jpg\" height=66></img>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" +
    "<img src=\"static/usda_logo.jpg\" height=58></img>" +
    "</div>" +
    "<div class=\"bottom-buttons\">"+
    "<button type='button' onclick='javascript:carta.hide(\"instructionsPopout\");'>hide</button>" +
    "<button type='button' onclick='javascript:carta.changeMessage(\"instructionsPopout\",carta.GOOGLE_TEAM_DRIVE_DOWNLOAD_HTML);'>download data</button>" +
    "<button type='button' onclick='javascript:carta.changeMessage(\"instructionsPopout\",carta.DEFAULT_ABOUT_HTML);'>back to help</button>" +
    "</div>";
carta.hide = function(id='instructionsPopout') {
  var div = document.getElementById(id);
    if (div.style.display === "none") {
        div.style.display = "block";
    } else {
        div.style.display = "none";
    }
};

carta.show = function(id='instructionsPopout') {
  var div = document.getElementById(id);
    if (div.style.display === "none") {
        div.style.display = "block";
    } else {
        div.style.display = "block";
    }
};

carta.toggle = function(id='instructionsPopout'){
  // is the infobox currently displayed?
  if( document.getElementById(id).style.display === "" | document.getElementById(id).style.display === "block" ){
    // hide it
    carta.hide(id)
  // else: show it
  } else {
    carta.show(id)
  }
}

carta.changeMessage = function(id='instructionsPopout', text){
  var div = document.getElementById(id);
  if(text === "none") {
    div.innerHTML =  carta.DEFAULT_ABOUT_HTML;
  } else {
    div.innerHTML = text
  }
};


///////////////////////////////////////////////////////////////////////////////
//                        Add-On: D3 Legend Interface
///////////////////////////////////////////////////////////////////////////////

susie = { };

susie.setLegendLinear = function(title=undefined, svgId='svg', domain=[0,1], labels=undefined, cells=2, startColor="rgba(237, 248, 177, 0.98)", endColor="rgba(8, 29, 88, 0.98)"){
  if(labels == null){
    labels = d3.range.apply(this, domain.concat(domain[1]/cells))
    labels = labels.concat(domain[1])
    // transparently adjust our "cells" values to account for taking on a tail
    cells=cells+1
    labels = labels.map(function(e){
      return Number(e.toFixed(2));
    });
  }
  var linear = d3.scaleLinear()
    .domain(domain)
    .range([startColor, endColor]);

  var svg = d3.select(svgId);


  svg.append("g")
    .attr("class", "legendLinear")
    .attr("transform", "translate(20,20)")
    .style("font-size","11px")
    .style("font-family","Roboto");

  // determine a sane number of pixels for our legend SVG
  if ( window.matchMedia("(orientation:portrait)").matches ) {
    var shape_width = 15
    var title_width = 250
  } else {
    var shape_width = 20
    var title_width = 275
  }

  var legend = d3.legendColor()
    .shapeWidth(shape_width)
    .shapePadding(5)
    .cells(cells)
    .shape("square")
    .orient('horizontal')
    .title(title)
    .titleWidth(title_width)
    .labelWrap(30)
    .labels(labels)
    .labelAlign("middle")
    .scale(linear);

  svg.select(".legendLinear")
    .call(legend);
};

susie.hide = function(id='legendPopout') {
  var div = document.getElementById(id);
    if (div.style.display === "none") {
        div.style.display = "block";
    } else {
        div.style.display = "none";
    }
};

susie.show = function(id='legendPopout') {
  var div = document.getElementById(id);
    if (div.style.display === "none") {
        div.style.display = "block";
    } else {
        div.style.display = "block";
    }
};

susie.toggle = function(id='legendPopout'){
  // is the infobox currently displayed?
  if( document.getElementById(id).style.display === "" | document.getElementById(id).style.display === "block" ){
    // hide it
    susie.hide(id)
  // else: show it
  } else {
    susie.show(id)
  }
};

susie.toggleEeLayerById = function(id) {
 var checkbox = document.getElementById(id);
 if(checkbox.checked){
   if(id.includes('historical')){
     trendy.App.addLayer(trendy.App.historicalLayer, id='historical');
   } else {
     trendy.App.addLayer(trendy.App.mostRecentLayer, id='most_recent');
   }
 } else {
   if(id.includes('historical')){
     trendy.App.removeLayer(id='historical');
   } else {
     trendy.App.removeLayer(id='most_recent');
   }
 }
};

///////////////////////////////////////////////////////////////////////////////
// Right-click context menu stuff
///////////////////////////////////////////////////////////////////////////////
menu = { };

menu.menuDisplayed = false;
menu.menuBox = null;

/* DOM click event handlers */

// bind to the DOM right-click context menu event
window.addEventListener("contextmenu", function() {
  var left = arguments[0].clientX;
  var top = arguments[0].clientY;

  menu.menuBox = window.document.querySelector(".menu");
  menu.menuBox.style.left = left + "px";
  menu.menuBox.style.top = top + "px";
  menu.menuBox.style.display = "block";

  arguments[0].preventDefault();

  menu.menuDisplayed = true;
}, false);
/* UI Handlers */
menu.hide = function(){
  if(menu.menuDisplayed == true){
      menu.menuBox.style.display = "none";
  }
}
menu.toggle_legend = function(){
  susie.toggle();
  menu.hide();
}
menu.toggle_help = function(){
  carta.toggle();
  menu.hide();
}
/* GEE processing methods */
menu.export_features = function(){
  alert("exporting")
  // hide the menu
  if(menu.menuDisplayed == true){
      menu.menuBox.style.display = "none";
  }
}
menu.remove_all_features = function(){
  trendy.App.removeAllFeatures();
  menu.hide();
}
