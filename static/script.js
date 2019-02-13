/**
 * @fileoverview Runs the Surface Hydrology Viewer application
 * Author(s): Kyle Taylor (kyle.taylor@pljv.org)
 * License: All PLJV additions are released as GPL v3
 * Copyright: Playa Lakes Joint Venture (2017)
 */

kwap = {};  // Our namespace.

/**
 * Starts the web application. The main entry point for the app.
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
 * @param {string} serializedPolygonIds A serialized array of the IDs of the
 *     polygons to show on the map. For example: "['poland', 'moldova']".
 */

kwap.boot = function(historicalEeMapId, mostRecentEeMapId, historicalEeToken, mostRecentEeToken) {
  // Load external libraries.
  google.load('visualization', '1.0');
  google.load('jquery', '1');
  //  this key has domain restrictions associated with it
  google.load('maps', '3', {'other_params': 'key=AIzaSyDraxoLomEu1kNGyDFpb6K-SU4FSmAFZWc&libraries=drawing,places'});
  // Create the web app.
  google.setOnLoadCallback(function() {
    /* note our image asset id's here -- we'll use them later */
    kwap.App.historicalAssetId = 'users/adaniels/shared/LC5historicwetness_10m'
    kwap.App.mostRecentAssetId = 'users/kyletaylor/shared/LC8dynamicwater'
    kwap.App.acquisitionTimeAssetId = 'users/kyletaylor/shared/time_of_landsat_mosaic_pixel'
    /* create layers for each asset */
    kwap.App.historicalLayer = kwap.App.getEeMapType(historicalEeMapId, historicalEeToken);
    kwap.App.mostRecentLayer = kwap.App.getEeMapType(mostRecentEeMapId, mostRecentEeToken);
    // calls createMap() with our historical layer
    kwap.App(kwap.App.historicalLayer);
    kwap.App.addLayer(kwap.App.mostRecentLayer, id='mostRecent');
  });
  // set our default message for the information popout
  carta.changeMessage("instructionsPopout", carta.DEFAULT_ABOUT_HTML);
  // initialize any lurking div elements for controls
  kwap.App.addGeocoderControl();
  // empty initialization for our polygons, points, and
  // drawing manager shape cache
  kwap.App.polygons = [];
  kwap.App.markers = [];
  kwap.App.shape_extractions = []
};


///////////////////////////////////////////////////////////////////////////////
//                               The application.                            //
///////////////////////////////////////////////////////////////////////////////



/**
 * The main web application.
 * This constructor renders the UI and sets up event handling.
 * @param {google.maps.ImageMapType} mapType The map type to render on the map.
 * @param {Array<string>} polygonIds The IDs of the polygons to show on the map.
 *     For example ['poland', 'moldova'].
 * @constructor
 */

kwap.App = function(mapType, polygonIds) {
  // Create and display the map.
  kwap.App.createMap(mapType);
  // Fix our default zoom levels
  // Add a move listener to restrict the bounds range
  kwap.App.map.addListener('center_changed', function() {
    menu.hide(); // always hide the context menu on map events
    kwap.App.checkBounds();
  });
  kwap.App.map.addListener('click', function(){
    menu.hide(); // always hide the context menu on map events
  })
};

/**
 * Creates a Google Map with a black background the given map type rendered.
 * The map is anchored to the DOM element with the CSS class 'map'.
 * @param {google.maps.ImageMapType} mapType The map type to include on the map.
 * @return {google.maps.Map} A map instance with the map type rendered.
 */

kwap.App.createMap = function(mapType) {
  // initialize our layers stack
  kwap.App.numLayers = 0;
  kwap.App.defaultMapOptions = {
    backgroundColor: '#00000',
    center: kwap.App.DEFAULT_CENTER,
    zoom: kwap.App.DEFAULT_ZOOM,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
    minZoom: 4,
    maxZoom: 17,
    scaleControl: true,
    streetViewControl: false, 
    drawingControl: false,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
              position: google.maps.ControlPosition.TOP_LEFT
    }
  };
                                 //Lower, Left                    //Upper, Right
  kwap.App.allowedBounds = new google.maps.
    LatLngBounds(new google.maps.LatLng(37,-102), new google.maps.LatLng(40.1,-94.58));

  var mapEl = $('.map').get(0);
  kwap.App.map = new google.maps.Map(mapEl, kwap.App.defaultMapOptions);
  // set our style options
  kwap.App.map.setOptions({styles: kwap.App.BASE_MAP_STYLE});
  // add our 30 year historical imagery by default
  kwap.App.addLayer(mapType, is='historical');
  // now add the boundary for the state of Kansas
  kwap.App.map.data.loadGeoJson('static/kansas.json');
  kwap.App.map.data.setStyle({
    fillColor: 'white',
    fillOpacity:0,
    strokeColor: "#f7f7f7",
    strokeOpacity: 0.9,
    strokeWeight: 1.5
  })
  // add the drawing manager control
  kwap.App.addDrawingManagerControl();
  // initialize our places api service
  kwap.App.placesService = new google.maps.places.PlacesService(kwap.App.map);
};

/*
 * Add an additional layer to an existing map object
 */

 kwap.App.addLayer = function(mapType, id){
    kwap.App.map.overlayMapTypes.push(mapType);
    kwap.App.numLayers += 1
    if(id.includes("istor")){
      kwap.App.historicalLayer.at = (kwap.App.numLayers-1)
    } else if(id.includes("ost")) {
      kwap.App.mostRecentLayer.at = (kwap.App.numLayers-1)
    }
 }
 /*
  * Remove a EE Image layer by it's UI-ID
  */
 kwap.App.removeLayer = function(id){
   if(id.includes("istor")){
     kwap.App.map.overlayMapTypes.removeAt(kwap.App.historicalLayer.at);
     kwap.App.historicalLayer.at = null
     kwap.App.numLayers -= 1
     // if we still have the other layer on the map, adjust it's array pos
     if(kwap.App.mostRecentLayer.at){
       kwap.App.mostRecentLayer.at -= 1
     }
   } else if(id.includes("ost")){
     kwap.App.map.overlayMapTypes.removeAt(kwap.App.mostRecentLayer.at);
     kwap.App.mostRecentLayer.at = null
     kwap.App.numLayers -= 1
     // if we still have the other layer on the map, adjust it's array pos
     if(kwap.App.historicalLayer.at){
       kwap.App.historicalLayer.at -= 1
     }
   }
 }
/**
 * If the map position is out of range, move it back
 */
kwap.App.checkBounds = function() {
      // Perform the check and return if OK
      if (kwap.App.allowedBounds.contains(kwap.App.map.getCenter())) {
        return;
      }
      // If it`s not OK, find the nearest allowed point and move there
      var C = kwap.App.map.getCenter();
      var X = C.lng();
      var Y = C.lat();

      var AmaxX = kwap.App.allowedBounds.getNorthEast().lng();
      var AmaxY = kwap.App.allowedBounds.getNorthEast().lat();
      var AminX = kwap.App.allowedBounds.getSouthWest().lng();
      var AminY = kwap.App.allowedBounds.getSouthWest().lat();

      if (X < AminX) {X = AminX;}
      if (X > AmaxX) {X = AmaxX;}
      if (Y < AminY) {Y = AminY;}
      if (Y > AmaxY) {Y = AmaxY;}
      //alert ("Restricting "+Y+" "+X);
      kwap.App.map.panTo(new google.maps.LatLng(Y,X));
}

kwap.App.addDrawingManagerControl = function(show=false){
  // load our drawing manager interface
  kwap.App.drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: google.maps.drawing.OverlayType.MARKER,
    drawingControlOptions: {
      drawingModes: ['marker','polygon','rectangle'],
      position: google.maps.ControlPosition.TOP_CENTER,
    },
    markerOptions: { editable: true, draggable: true, alpha: '0.95' },
    polygonOptions: { editable: true },
    rectangleOptions: { editable: true}
  });
  // show method
  kwap.App.drawingManager.show = function(){
    kwap.App.map.setOptions({ drawingControl: true });
  }
  // hide method
  kwap.App.drawingManager.hide = function(){
    kwap.App.map.setOptions({ drawingControl: false });
  }
  google.maps.event.addListener(kwap.App.drawingManager, 'overlaycomplete', function(event) {
    rectangleToPolygon = function(x){
      bounds = x.getBounds()
      bounds = [
        { lat: bounds.getSouthWest().lat(), lng: bounds.getSouthWest().lng() }, // south_west
        { lat: bounds.getNorthEast().lat(), lng: bounds.getSouthWest().lng() }, // north_west
        { lat: bounds.getNorthEast().lat(), lng: bounds.getNorthEast().lng() }, // north_east
        { lat: bounds.getSouthWest().lat(), lng: bounds.getNorthEast().lng() }  // south_east
      ]
      return(new google.maps.Polygon({paths:bounds, editable: true}))
    }
    /* event handler for POLYGON geometries */
    if( (event.type == google.maps.drawing.OverlayType.POLYGON) || (event.type == google.maps.drawing.OverlayType
    .RECTANGLE) )
     {
      // clear the existing stack
      if (kwap.App.polygons.length > 0) {
        kwap.App.polygons[kwap.App.polygons.length - 1].setMap(null);
        kwap.App.polygons.pop();
      }
      // convert RECTANGLE -> POLYGON (if needed) and push onto our stack
      if (event.type == google.maps.drawing.OverlayType.RECTANGLE) {
        kwap.App.polygons.push(rectangleToPolygon(event.overlay));
        event.overlay.setMap(null);
        kwap.App.polygons[0].setMap(kwap.App.map);
      } else {
        kwap.App.polygons.push(event.overlay);
      }
      // add an area label as an info window with common event triggers
      mean = function(x){
        var s = 0;
        for(var i=0; i<x.length; i++){
          s += x[i];
        }
        return(Math.round((s/x.length)*10000)/10000)
      };
      generateInfoWindow = function(polygon){
        // async call will store result in kwap.App.polygonFeatureExtraction
        kwap.App.processFeatures(
          kwap.App.featuresToJson(kwap.App.polygons, compress=true),
          kwap.App.historicalAssetId,
          kwap.App.polygonFeaturesCallback
        )
        // calculate a centroid from our polygon feature vertices
        // and use it to populate a pop-out label
        var vertices =
          polygon.
            getPath().
            getArray().
            map(function(x){ return([ x.lat(), x.lng()]) });
        centroid = new google.maps.LatLng(
          mean(vertices.map(function(x){return(x[0])})),
          mean(vertices.map(function(x){return(x[1])}))
        );
        // build a label from the current geometry on the canvas
        label = "Area (Acres) : " + String(Math.round(
          0.000247105 * google.maps.geometry.spherical.computeArea(polygon.getPath())
        ))
        // add a simple info window pop-out to the canvas
        kwap.App.infoWindow = new google.maps.InfoWindow();
        kwap.App.infoWindow.setContent(label);
        kwap.App.infoWindow.setPosition(centroid);
        kwap.App.infoWindow.open(kwap.App.map);
      };
      // load the pop-out after initial draw
      generateInfoWindow(kwap.App.polygons[0]);
      // add a single click and resize event handler(s) to do the same
      google.maps.event.addListener(kwap.App.polygons[0], 'click', function (e) {
        generateInfoWindow(kwap.App.polygons[0]);
      });
      google.maps.event.addListener(kwap.App.polygons[0], 'resize', function (e){
        generateInfoWindow(kwap.App.polygons[0]);
      });
      // set visible on canvas
      kwap.App.polygons[0].setMap(kwap.App.map);
    /* event handlers for MARKER geometries */
    } else if(event.type == google.maps.drawing.OverlayType.MARKER) {
      if (kwap.App.markers.length > 0) {
        kwap.App.markers[kwap.App.markers.length - 1].setMap(null);
        kwap.App.markers.pop();
      }
      kwap.App.markers.push(event.overlay);
      google.maps.event.addListener(kwap.App.markers[0], 'dragend', function (e) {
        menu.export_features();
      });
      kwap.App.markers[0].setMap(kwap.App.map);
      // fire our earth engine reduce operation automatically on 'done'
      menu.export_features();
    }
  });
  // by default, the drawing manager is hidden -- let's show it
  kwap.App.drawingManager.setMap(kwap.App.map);
  if(show){
    kwap.App.drawingManager.show();
  }
}

kwap.App.removeAllFeatures = function(){
  for (var i = 0; i < kwap.App.markers.length; i++) {
     kwap.App.markers[i].setMap(null);
     kwap.App.markers = []
  }
  for (var i = 0; i < kwap.App.polygons.length; i++) {
     kwap.App.polygons[i].setMap(null);
     kwap.App.polygons = [];
  }
}

kwap.App.searchByPlace = function(search_string, callback){
  var request = {
    query: search_string.toLowerCase(),
    fields: ['geometry']
  };
  if(!callback){
  kwap.App.placesService.findPlaceFromQuery(
    request,
    function(pos){
      var me = new google.maps.LatLng(
        pos[0].geometry.location.lat(),
        pos[0].geometry.location.lng()
      );
      kwap.App.map.panTo(me);
      kwap.App.map.setZoom(14);
    });
  } else {
    kwap.App.placesService.findPlaceFromQuery(
      request,
      callback
    );
  }
  // drop the search value and hide the search box
  kwap.App.search_textinput.value="";
  document.getElementById('geocoderSearchbox').style.display = "none";
  window.location.hash = '#map';
}

kwap.App.toggleInfobox = function(id='instructionsPopout'){
  // is the infobox currently displayed?
  if( document.getElementById(id).style.display === "" | document.getElementById(id).style.display === "block" ){
    // hide it
    document.getElementById(id).style.display = "none"
  // else: show it
  } else {
    document.getElementById(id).style.display = "block"
  }
}

kwap.App.addGeocoderControl = function(){
  geocoderSearchbox = window.document.querySelector(".geocoderSearchbox");
  // stylize our interface elements
  kwap.App.search_textinput = document.createElement('input');
    kwap.App.search_textinput.type = "text";
    kwap.App.search_textinput.id = "search_textinput";
    kwap.App.search_textinput.style.width = "74%";
    kwap.App.search_textinput.style.fontSize = "13px";
    kwap.App.search_textinput.style.float = "left";
    kwap.App.search_textinput.style.height = "40px";
    kwap.App.search_textinput.style.maxHeight = "40px";
    kwap.App.search_textinput.style.lineHeight = "40px";
    kwap.App.search_textinput.style.padding = "0";
    kwap.App.search_textinput.style.boxSizing = "border-box";
  kwap.App.search_textinput.onkeydown = function(event) {
    if (event.key == "Enter") {
      kwap.App.searchByPlace(kwap.App.search_textinput.value)
    }
  };
  kwap.App.search_button = document.createElement('input');
    kwap.App.search_button.type = "button";
    kwap.App.search_button.value = "search"
    kwap.App.search_button.style.width = "24%";
    kwap.App.search_button.style.float = "right";
    kwap.App.search_button.style.height = "40px";
    kwap.App.search_button.style.maxHeight = "40px";
    kwap.App.search_button.style.padding = "0";

    kwap.App.search_button.style.boxSizing = "border-box";
  kwap.App.search_button.onclick = function() {
    kwap.App.searchByPlace(kwap.App.search_textinput.value)
  };
  // append elements to div
  geocoderSearchbox.appendChild(kwap.App.search_textinput);
  geocoderSearchbox.appendChild(kwap.App.search_button);
  geocoderSearchbox.style.display = "none";
}

kwap.App.toggleGeocoder = function(id='geocoderSearchbox', click_event='none'){
  // is the geocoder search box currently displayed?
  if( document.getElementById(id).style.display === "" | document.getElementById(id).style.display === "block" ){
    // hide it
    document.getElementById(id).style.display = "none"
    window.location.hash = '#map';
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
    // give it focus
    window.location.hash = '#search_textinput';
  }
}
/*
 * downloadCSV()
 * accepts a URI encoded string as text input and saves
 * the result to disk as a CSV file using the browser's
 * default download file dialog
 */
kwap.App.downloadCSV = function(filename, text){
    var pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);

    if (document.createEvent) {
        var event = document.createEvent('MouseEvents');
        event.initEvent('click', true, true);
        pom.dispatchEvent(event);
    }
    else {
        pom.click();
    }
}
kwap.App.lzCompress = function(string){
  // default : compressToEncodedURIComponent -- we lose a little bit of
  // shrinkage here, but we end-up with strings that are compatible with
  // our HTTP handlers
  return(LZString.compressToEncodedURIComponent(string))
}
kwap.App.lzDecompress = function(string){
  return(LZString.decompressFromEncodedURIComponent(string))
}
// quick and dirty Google Maps Data -> GeoJSON converter that will dump
// a MultiPoint or MultiPolygon object as a json string.
kwap.App.featuresToJson = function(features, compress=false) {
  if (typeof(features) == "string"){
    return(JSON.parse(features))
  }
  _features_geojson = [];
  features.forEach(function(feature, i){
    if(feature instanceof google.maps.Polygon) {
      coords = feature.getPath().getArray().map(function(x){
        return([ x.lng(), x.lat()])
      })
    } else if(feature instanceof google.maps.Marker){
      coords = [ feature.getPosition().lng(), feature.getPosition().lat() ];
    } else {
      coords = [ ]
    }
    var _feature_json = {
      type:'Feature',
      geometry: {
        type: feature instanceof google.maps.Marker ? "Point" : 'Polygon',
        coordinates: feature instanceof google.maps.Marker ? coords : [ coords ]
      },
      properties: {
        'fid': i
      }
    };
    _features_geojson.push(_feature_json);
  });
  _features_geojson = {
    type: "FeatureCollection",
    features: _features_geojson
  }
  // pack with lzstring for our URL handler if asked
  if (compress) {
    _features_geojson = kwap.App.lzCompress(JSON.stringify(_features_geojson))
  }
  return(_features_geojson)
}
/* the default response will be a json formatted object with a 'mean'
 * property containing our reduce operation
 */
kwap.App.unpackFeatureExtractions = function(features){
  _features = []
  for(i=0; i < features.length; i++){
    if(features[i]['properties'].length<2){
      console.log(features[i]['properties'])
    }
    result = Math.round(features[i]['properties']['mean']*100)/100
    result = result || 0
    _features.push(result)
  }
  return(_features)
}
/* async handler for a point extraction for our landsat 8 acquisition time
 * product. Note that the asset ID here is fixed and should never change
 */
kwap.App.processAcquisitionDate = function(features, callBack=null){
    // Asynchronously load and show details about the point feature
    uuAssetId = kwap.App.lzCompress(kwap.App.acquisitionTimeAssetId)
    // extract unix time for our landsat 8 product
    $.get('/extract?features=' + features + '&assetId=' + uuAssetId).done((function(data) {
        if (data['error']) {
          data = data['error']
        } else {
          // unpack our json response from the backend
          date_str = new Date(Math.round(kwap.App.featuresToJson(
              kwap.App.lzDecompress(data)
            )[0]['properties']['mean']));
          kwap.App.acquisition_date_str = date_str.toDateString().split(' ').splice(1,3).join(' ');
          callBack(kwap.App.acquisition_date_str)
        }
    }).bind(this));
}
kwap.App.processFeatures = function(features, assetId, callBack=null){
  // Asynchronously load and show details about the point feature
  uuAssetId = kwap.App.lzCompress(assetId)
  $.get('/extract?features=' + features + '&assetId=' + uuAssetId).done((function(data) {
    if (data['error']) {
      comp_str = data['error']
    } else {
      comp_str = data
    }
    if(assetId.includes('hist')){
      kwap.App.historical_ext = kwap.App.featuresToJson(
        kwap.App.lzDecompress(comp_str)
      )
      // use our user-specified callback
      if (callBack != null){
        callBack(kwap.App.historical_ext)
      }
    } else {
      kwap.App.lastWetScene_ext = kwap.App.featuresToJson(
        kwap.App.lzDecompress(comp_str)
      )
      // use our user-specified callback
      if (callBack != null){
        callBack(kwap.App.lastWetScene_ext)
      }
    }
  }).bind(this));
}
kwap.App.pointFeaturesCallback = function(features){
  label = {
    text: String(kwap.App.unpackFeatureExtractions(features)),
    fontWeight: 'bold',
    fontSize: '10px'
  }
  // set our marker label
  kwap.App.markers[0].setLabel(label)
}
kwap.App.acquisitionDateCallback = function(features){
  var floating_acquisition_el = document.getElementById('acquisitionDate');
  floating_acquisition_el.id = "acquisitionDate";
  floating_acquisition_el.style.display = "none";
  floating_acquisition_el.style.position = 'absolute';
  floating_acquisition_el.style.bottom = '20px';
  floating_acquisition_el.style.right = '20px';
  floating_acquisition_el.style.width = "360px";
  floating_acquisition_el.style.fontSize = "16px";
  floating_acquisition_el.style.fontWeight = "300";
  floating_acquisition_el.style.fontFamily = "Roboto";
  floating_acquisition_el.style.height = "25px";
  floating_acquisition_el.style.padding = "0";
  floating_acquisition_el.style.color = 'rgba(255, 255, 255, 0.95)';
  floating_acquisition_el.style.textShadow = '1.5px 1.5px rgba(0, 0, 0, 0.95)';
  floating_acquisition_el.style.backgroundColor = 'rgba(255, 255, 255, 0)';
  floating_acquisition_el.style.zIndex = 2000000001;
  floating_acquisition_el.innerHTML = "<b><big>Scene Acquisition Date: " + kwap.App.acquisition_date_str + "</big></b>";
  floating_acquisition_el.style.display = "block";
}
kwap.App.polygonFeaturesCallback = function(features){
  extraction = kwap.App.unpackFeatureExtractions(features)
  label = kwap.App.infoWindow.getContent();
  label = label + "<br>Area Wet Frequency (Mean) : " + String(
          Math.round(extraction*100)/100)
  kwap.App.infoWindow.setContent(label);
}
kwap.App.addLocationMarker = function(panTo=true){
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
      map: kwap.App.map
  });
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function(pos) {
      var me = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      myLocationIcon.setPosition(me);
      if(panTo){
        kwap.App.map.panTo(me);
        kwap.App.map.setZoom(14)
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
kwap.App.getEeMapType = function(eeMapId, eeToken) {
  var eeMapOptions = {
    getTileUrl: function(tile, zoom) {
      var url = kwap.App.EE_URL + '/map/';
      url += [eeMapId, zoom, tile.x, tile.y].join('/');
      url += '?token=' + eeToken;
      return url;
    },
    tileSize: new google.maps.Size(256, 256)
  };
  return new google.maps.ImageMapType(eeMapOptions);
};


/** @type {string} The Earth Engine API URL. */
kwap.App.EE_URL = 'https://earthengine.googleapis.com';


/** @type {number} The default zoom level for the map. */
kwap.App.DEFAULT_ZOOM = 9;


/** @type {Object} The default center of the map. */
kwap.App.DEFAULT_CENTER = {lng: -98.38, lat: 38.48};

/**
 * @type {Array} An array of Google Map styles. See:
 *     https://developers.google.com/maps/documentation/javascript/styling
 */

kwap.App.BASE_MAP_STYLE = [
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
    "  <h3>Kansas Water Map</h3>" +
    "</div>" +
    "<div class=\"scroll-box\">" +
    "Welcome to the Kansas Water Map !" +
    "<br><br>" +
    "This map displays the current and historic distribution of surface water in the state of Kansas, and is designed to help producers, private landowners, and biologists to identify and track recent and long-term patterns in surface water availability. You can explore surface water data here in your browser or download and work with the data directly in a GIS." +
    "<br><br>" +
    "The layers used in this map were created with Google Earth Engine by analyzing data from the Landsat 8 and Landsat 5 satellite platforms. Data from the Landsat 5 platform was used to map the frequency of historic wetness from 1985 to 2012. Data from the Landsat 8 platform is used to update the current wetness product." +
    "<br><br>" +
    "  • <a href=\"http://pljv.org/about-us/\" target=\"_blank\" rel=\"noopener\">About Playa Lakes Joint Venture</a> (External Site) <br>" +
    "  • <a href=\"https://www.nrcs.usda.gov/wps/portal/nrcs/site/ks/home/\" target=\"_blank\" rel=\"noopener\">About NRCS</a> (External Site)<br><br>" +
    "<hr width='95%'><center>" +
    "<img src=\"static/pljv_logo.jpg\" height=66></img>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" +
    "<img src=\"static/usda_logo.jpg\" height=58></img><br><br>" +
    "</center><hr width='95%'>" +
    "Tips on usage :" +
    "<ul>" +
    "  <li>You can navigate the map by <b>left-clicking</b> and holding with your mouse and then moving the mouse. If"+
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
    "   in spreadsheet software like Excel, LibreOffice, or ‘R’.</li>" +
    " <li>You can also use the <b>right-click</b> context menu to remove all features on the map, as well as hide" +
    "   interface elements like the legend and this help window.</li>" +
    "</ul>" +
    "For a demonstration walk-through on using this app, we’ve made you a handy YouTube video (see: <a href='https://youtu.be/oQZhcnqNwWw'>external link</a>)." +
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
    "&nbsp;&nbsp;<b>&#8226;</b>&nbsp;&nbsp;<a target='_blank' href='https://drive.google.com/open?id=1d5BPL7LJUiTYhcPTgB3MGcPRIqzNxxC9'>30 Year Historical Surface Wetness</a> (Google Drive)<br><br>" +
    "<hr width='95%'>" +
    "The source data for the web app are maintained as Google Earth Engine assets. If you use Google Earth Engine and you'd just like to <a target='_blank' href='https://developers.google.com/earth-engine/asset_manager#importing-assets-to-your-script'>import the assets</a> " + "directly into your code, here are the asset ID's:<br><br>" +
    "<b>Most Recent Scene</b><br>&nbsp;&nbsp;<b>&#8226;</b>&nbsp;&nbsp;assetId='<a href='https://code.earthengine.google.com/?asset=users/kyletaylor/shared/LC8dynamicwater' target='_blank'>users/kyletaylor/shared/LC8dynamicwater</a>'<br>" +
    "<br><b>30 Year Historical</b><br>&nbsp;&nbsp;<b>&#8226;</b>&nbsp;&nbsp;assetId='<a href='https://code.earthengine.google.com/?asset=users/adaniels/shared/LC5historicwetness_10m' target='_blank'>users/adaniels/shared/LC5historicwetness_10m</a>'<br>" +
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
    "This project was developed by the Playa Lakes Joint Venture and funded by the U.S. Department of Agriculture’s Kansas Natural Resources Conservation Service (NRCS) through a Conservation Innovation Grant. USDA is an equal opportunity provider, employer, and lender. Data from this site are intended for informational purposes only. The authors make no guarantee as to the accuracy of the data. Furthermore, the depiction of areas on this map as wet or previously wet does not constitute any determination of wetland status under section 404 of the Clean Water Act, nor does it guarantee eligibility for conservation programs under the Agricultural Act of 2014."+
    "<br><br>"+
    "The water detection algorithm used utilizes the difference in reflectivity between the red and short-wave infrared bands. This classifier is conservative and minimizes errors of commission. The overall accuracy of this algorithm in detecting surface water in Kansas is 86%; the user’s accuracy is 92%. Note that the web viewer only displays historical wetness > 3%, but the drawing manager uses all values in estimating area means."+
    "<br><br>" +
    "The source code for this hydrology viewer is released under a public license (<a href=\"https://github.com/PLJV/SurfaceHydrologyDST/blob/master/LICENSE\" target=\"_blank\">GPLv3</a>). If you are a developer and would like to contribute to the project, report a bug, or fork it and make your own, you can get in touch with the developers at PLJV using our GitHub project page." +
    "<br><br>" +
    "  • <a href=\"https://github.com/PLJV/SurfaceHydrologyDST/\" target=\"_blank\" rel=\"noopener\">GitHub Project Page</a> (External Site) <br>"+
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

susie.setLegend = function(title=undefined, svgId='svg', domain=[0,1], labels=undefined, cells=2, startColor="rgba(237, 248, 177, 0.98)", endColor="rgba(8, 29, 88, 0.98)"){
  if(labels == null){
    labels = d3.range.apply(this, domain.concat(domain[1]/cells))
    labels = labels.concat(domain[1])
    // transparently adjust our "cells" values to account for taking on a tail
    cells=cells+1
    labels = labels.map(function(e){
      return Number(e.toFixed(2));
    });
  }
  var scale = d3.scaleLog()
    .domain(domain)
    .range([startColor, endColor]);

  var svg = d3.select(svgId);

  svg.append("g")
    .attr("class", "legend")
    .attr("transform", "translate(20,20)")
    .style("font-size","13px")
    .style("font-weight", "300")
    .style("font-family","Roboto");

  // determine a sane number of pixels for our legend SVG
  if ( window.matchMedia("(orientation:portrait)").matches ) {
    var shape_width = 15
    var title_width = 255
  } else {
    var shape_width = 20
    var title_width = 300
  }

  var legend = d3.legendColor()
    .shapeWidth(shape_width)
    .shapePadding(8)
    .cells(cells)
    .shape("square")
    .orient('horizontal')
    .title(title)
    .titleWidth(title_width)
    .labelWrap(30)
    .labels(labels)
    .labelAlign("middle")
    .scale(scale);

  svg.select(".legend")
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
     kwap.App.addLayer(kwap.App.historicalLayer, id='historical');
   } else {
     kwap.App.addLayer(kwap.App.mostRecentLayer, id='most_recent');
   }
 } else {
   if(id.includes('historical')){
     kwap.App.removeLayer(id='historical');
   } else {
     kwap.App.removeLayer(id='most_recent');
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
  ft = kwap.App.featuresToJson(kwap.App.markers, true)
  kwap.App.processAcquisitionDate(ft, kwap.App.acquisitionDateCallback)
  kwap.App.processFeatures(ft, kwap.App.historicalAssetId, kwap.App.pointFeaturesCallback)
  // hide the menu
  if(menu.menuDisplayed == true){
      menu.menuBox.style.display = "none";
  }
}
menu.remove_all_features = function(){
  kwap.App.removeAllFeatures();
  menu.hide();
}
menu.toggle_search = function(event){
  kwap.App.toggleGeocoder(id='geocoderSearchbox', click_event=event)
  menu.hide();
}
