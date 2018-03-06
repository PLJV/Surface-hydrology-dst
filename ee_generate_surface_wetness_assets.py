# mucking about with dates and times, the date range is the last 4 months
now = Date.now()
then = now - 10368000000
eenow = ee.Date(now)
eethen = ee.Date(then)

# get the most recent image from a given collection
def imagefromcollection(pcollection=None):
  collection = ee.ImageCollection(pcollection).
    filterDate(eethen, eenow).filterMetadata('CLOUD_COVER', 'less_than', .3)
  recent = collection.sort('system:time_start', false).limit(1)
  return collection.mosaic()

# here's the standard band manipulation for classifying surface water
def water(plandsatimage=None):
  //extract band4 from image and assign that to variable b4
  b4 = plandsatimage.select('B4');
  //extract band6 from image and assign that to variable b6
  b6 = plandsatimage.select('B6');
  blank = ee.Image(0);
  output = blank.where(b6.lte(b4),1);
  return output.updateMask(output);

# define a geometry for Kansas
kansas = ee.FeatureCollection('ft:1fRY18cjsHzDgGiJiS2nnpUU3v9JPDc2HNaR7Xk8').
    .filter(ee.Filter.eq('Name', 'Kansas'))

// Export the image to an Earth Engine asset.
Export.image.toAsset({
  image: water(imagefromcollection('LANDSAT/LC08/C01/T1')).clipToCollection(kansas),
  description: 'dynamicwater_last4months',
  assetId: 'LC8dynamicwater',
  scale: 30,
  region: kansas,
  pyramidingPolicy: {'.default': 'sample'},
  maxPixels: 400000000,
  });
