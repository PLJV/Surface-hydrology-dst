/**
 * @fileoverview Runs the Trendy Lights application. The code is executed in the
 * user's browser. It communicates with the App Engine backend, renders output
 * to the screen, and handles user interactions.
 */


trendy = {};  // Our namespace.


/**
 * Starts the Trendy Lights application. The main entry point for the app.
 * @param {string} eeMapId The Earth Engine map ID.
 * @param {string} eeToken The Earth Engine map token.
 * @param {string} serializedPolygonIds A serialized array of the IDs of the
 *     polygons to show on the map. For example: "['poland', 'moldova']".
 */
trendy.boot = function(eeMapId, eeToken, serializedPolygonIds) {
  // Load external libraries.
  google.load('visualization', '1.0');
  google.load('jquery', '1');
  google.load('maps', '3', {'other_params': 'key=AIzaSyD4wuFf8iTZZHiUznCAqPISanJkUjYhZ6k'})
//  this key has domain restrictions associated with it
//  google.load('maps', '3', {'other_params': 'key=AIzaSyDraxoLomEu1kNGyDFpb6K-SU4FSmAFZWc'});

  // Create the Trendy Lights app.
  google.setOnLoadCallback(function() {
    var mapType = trendy.App.getEeMapType(eeMapId, eeToken);
    var app = new trendy.App(mapType, JSON.parse(serializedPolygonIds));
  });
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
  this.map = this.createMap(mapType);

  // Add the polygons to the map.
  // this.addPolygons(polygonIds);

  // Register a click handler to show a panel when the user clicks on a place.
  this.map.data.addListener('click', this.handlePolygonClick.bind(this));

  // Register a click handler to hide the panel when the user clicks close.
  $('.panel .close').click(this.hidePanel.bind(this));

  // Register a click handler to expand the panel when the user taps on toggle.
  $('.panel .toggler').click((function() {
    $('.panel').toggleClass('expanded');
  }).bind(this));
};


/**
 * Creates a Google Map with a black background the given map type rendered.
 * The map is anchored to the DOM element with the CSS class 'map'.
 * @param {google.maps.ImageMapType} mapType The map type to include on the map.
 * @return {google.maps.Map} A map instance with the map type rendered.
 */
trendy.App.prototype.createMap = function(mapType) {
  var mapOptions = {
    backgroundColor: '#00000',
    center: trendy.App.DEFAULT_CENTER,
    zoom: trendy.App.DEFAULT_ZOOM
  };
  var mapEl = $('.map').get(0);
  var map = new google.maps.Map(mapEl, mapOptions);
  map.setOptions({styles: trendy.App.BASE_MAP_STYLE});
  map.overlayMapTypes.push(mapType);
  return map;
};


/**
 * Adds the polygons with the passed-in IDs to the map.
 * @param {Array<string>} polygonIds The IDs of the polygons to show on the map.
 *     For example ['poland', 'moldova'].
 */
trendy.App.prototype.addPolygons = function(polygonIds) {
  polygonIds.forEach((function(polygonId) {
    this.map.data.loadGeoJson('static/polygons/' + polygonId + '.json');
  }).bind(this));
  this.map.data.setStyle(function(feature) {
    return {
      fillColor: 'white',
      fillOpacity: '0.1',
      strokeColor: 'white',
      strokeWeight: 1
    };
  });
};


/**
 * Handles a on click a polygon. Highlights the polygon and shows details about
 * it in a panel.
 * @param {Object} event The event object, which contains details about the
 *     polygon clicked.
 */
trendy.App.prototype.handlePolygonClick = function(event) {
  this.clear();
  var feature = event.feature;

  // Instantly higlight the polygon and show the title of the polygon.
  this.map.data.overrideStyle(feature, {strokeWeight: 8});
  var title = feature.getProperty('title');
  $('.panel').show();
  $('.panel .title').show().text(title);

  // Asynchronously load and show details about the polygon.
  var id = feature.getProperty('id');
  $.get('/details?polygon_id=' + id).done((function(data) {
    if (data['error']) {
      $('.panel .error').show().html(data['error']);
    } else {
      $('.panel .wiki-url').show().attr('href', data['wikiUrl']);
      this.showChart(data['timeSeries']);
    }
  }).bind(this));
};


/** Clears the details panel and selected polygon. */
trendy.App.prototype.clear = function() {
  $('.panel .title').empty().hide();
  $('.panel .wiki-url').hide().attr('href', '');
  $('.panel .chart').empty().hide();
  $('.panel .error').empty().hide();
  $('.panel').hide();
  this.map.data.revertStyle();
};


/** Hides the details panel. */
trendy.App.prototype.hidePanel = function() {
  $('.panel').hide();
  this.clear();
};


/**
 * Shows a chart with the given timeseries.
 * @param {Array<Array<number>>} timeseries The timeseries data
 *     to plot in the chart.
 */
trendy.App.prototype.showChart = function(timeseries) {
  timeseries.forEach(function(point) {
    point[0] = new Date(parseInt(point[0], 10));
  });
  var data = new google.visualization.DataTable();
  data.addColumn('date');
  data.addColumn('number');
  data.addRows(timeseries);
  var wrapper = new google.visualization.ChartWrapper({
    chartType: 'LineChart',
    dataTable: data,
    options: {
      title: 'Brightness over time',
      curveType: 'function',
      legend: {position: 'none'},
      titleTextStyle: {fontName: 'Roboto'}
    }
  });
  $('.panel .chart').show();
  var chartEl = $('.chart').get(0);
  wrapper.setContainerId(chartEl);
  wrapper.draw();
};


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
trendy.App.DEFAULT_ZOOM = 10;


/** @type {Object} The default center of the map. */
trendy.App.DEFAULT_CENTER = {lng: -101.1091876, lat: 38.2976897};

/**
 * @type {Array} An array of Google Map styles. See:
 *     https://developers.google.com/maps/documentation/javascript/styling
 */
//trendy.App.BLACK_BASE_MAP_STYLES = [
//  {stylers: [{lightness: -100}]},
//  {
//    featureType: 'road',
//    elementType: 'labels',
//    stylers: [{visibility: 'off'}]
//  }
//];

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
//                        Add-on Interface Elements
///////////////////////////////////////////////////////////////////////////////

cartera = { };

cartera.hideElement = function(id) {
  var div = document.getElementById(id);
    if (div.style.display === "none") {
        div.style.display = "block";
    } else {
        div.style.display = "none";
    }
};

cartera.addMessage = function(text){

};

cartera.removeMessage = function(text){

};

cartera.changeMessage = function(text){

};
