kansas = ee.FeatureCollection('users/adaniels/tl_2014_us_state')
    .filter(ee.Filter.eq('NAME', 'Kansas'));

def water_ruiz2014(plandsatimage):
    return plandsatimage.expression('float(b("B3") > b("B5"))');


def water_mcfeeters1996(plandsatimage):
    b2 = plandsatimage.select('B2')
    b4 = plandsatimage.select('B4')
    ndwi = b2.subtract(b4).divide((b2.add(b4)))
    blank = ee.Image(0)
    out = blank.where(ndwi.gte(0),1)
    return out.updateMask(out)


def water_xu2007(plandsatimage):
    b2 = plandsatimage.select('B2')
    b5 = plandsatimage.select('B5')
    mndwi = b2.subtract(b5).divide((b2.add(b5)))
    blank = ee.Image(0)
    out = blank.where(mndwi.gte(0),1)
    return out.updateMask(out)

def qa(pimage):
    theimage = pimage.select('pixel_qa').bitwiseAnd(184).neq(0).eq(1)
    return pimage.updateMask(theimage)

def tenm_interpolation(image):
    band = image.select('B2');
    return image.resample('bilinear').reproject({crs: band.projection().crs(),scale: 10});

# Declare the initial collection based on collection ID and filter it by metadata and geographic parameters
collection = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR').\
    filterMetadata('CLOUD_COVER', 'less_than', 10).\
    filterMetadata('CLOUD_COVER', 'greater_than', -0.1).\
    filterDate('1985-10-26', '2012-10-27')\
    .filterBounds(kansas);

collection_qa = collection.map(qa)

h20freq = collection_qa.map(water_ruiz2014).mean()
h20freq = h20freq.updateMask(h20freq)

tenm_collection = collection_qa.map(tenm_interpolation)
h20freq_tenm = tenm_collection.map(water_ruiz2014).mean()

Export.image.toAsset({
    image: h20freq_tenm,
    description: '1985_2012_wetness_qa10m',
    assetId: 'users/adaniels/shared/LC5historicwetness_10m',
    scale: 10,
    region: kansas,
    pyramidingPolicy: {'.default': 'sample'},
    maxPixels: 40000000000,
})
