/* 
 * RERUM Geolocator Application Script
 * @author Bryan Haberberger
 * 
 * 
 */


GEOLOCATOR = {}

GEOLOCATOR.resource = {}

GEOLOCATOR.mymap={}

GEOLOCATOR.APPAGENT = "http://devstore.rerum.io/v1/id/5ed28964e4b048da2fa4be2b"

GEOLOCATOR.URLS = {
    DELETE: "delete",
    CREATE: "create",
    UPDATE: "update",
    QUERY: "query",
    OVERWRITE: "overwrite"
}

/**
 * A Web Annotation will have a body or a body.value that is a GeoJSON objects.
 * We want to return a flat array of the Features contained in the body.
 * This will also format the GeoJSON.properties for our metadata pop ups.
 * 
 * @param {type} annotation
 * @return {Array}
 */
GEOLOCATOR.parseGeoJSONFromWebAnnotation = function (annotation){
    let features = []
    let geoJsonType = ""
    let geoJsonObject = {}
    if(annotation.body.value && (annotation.body.value.type || annotation.body.value["@type"])){
        geoJsonType = annotation.body.value.type ? annotation.body.value.type : annotation.body.value["@type"] ? annotation.body.value["@type"] : ""
        geoJsonObject = annotation.body.value
    }
    else{
        geoJsonType = annotation.body.type ? annotation.body.type : annotation.body["@type"] ? annotation.body["@type"] : ""
        geoJsonObject = annotation.body
    }
    if(typeof geoJsonType === "string"){
        if(geoJsonType === "Feature"){
            if(!geoJsonObject.hasOwnProperty("properties")){
                geoJsonObject.properties = {}
            }
            if(annotation.hasOwnProperty("creator")){
                geoJsonObject.properties.annoCreator = annotation.creator
            }
            geoJsonObject.properties.annoID = annotation["@id"] ? annotation["@id"] : annotation.id ? annotation.id : ""
            geoJsonObject.properties.targetID = annotation.target ? annotation.target : ""
            features = [geoJsonObject]
        }
        else if (geoJsonType === "FeatureCollection"){
            if(geoJsonObject.hasOwnProperty("features") && geoJsonObject.features.length){
                features = geoJsonObject.features.map(feature => {
                    //We assume the application that created these coordinates did not apply properties.  
                    if(!feature.hasOwnProperty("properties")){
                        feature.properties = {}
                    }
                    if(annotation.hasOwnProperty("creator")){
                        feature.properties.annoCreator = annotation.creator
                    }
                    feature.properties.annoID = annotation["@id"] ? annotation["@id"] : annotation.id ? annotation.id : ""
                    feature.properties.targetID = annotation.target ? annotation.target : ""
                    return feature
                })
            }
        }
    }
    //TODO type could technically be an array.
    return features
}

/**
 * Given the URI of a web resource, resolve it and draw the GeoJSON-LD within.
 * @param {type} URI of the web resource to dereference and consume.
 * @return {Array}
 */
GEOLOCATOR.consumeForGeoJSON = async function(dataURL){
    let geoJSONFeatures = []
    let dataObj = await fetch(dataURL)
        .then(resp => resp.json())
        .then(man => {return man})
        .catch(err => {return null})
    if(dataObj){
        GEOLOCATOR.resource = JSON.parse(JSON.stringify(dataObj))
        let dataURI = dataObj["@id"] ?? dataObj.id ?? "Yikes"
        let resourceType = dataObj.type ?? dataObj["@type"] ?? "Yikes"
        /**
         * @context verification and validation.  This could probably be made better with a helper function.
         */
        switch(resourceType){
            case "Collection":
            case "Manifest":
            case "Range":
            case "Canvas":
                if(typeof dataObj["@context"] === "string" && 
                        (dataObj["@context"] !== "https://iiif.io/api/presentation/3/context.json" || dataObj["@context"] !== "http://iiif.io/api/presentation/3/context.json")
                    ){
                    alert("The IIIF resource type does not have the correct @context, it must be Presentation API 3.")
                    return geoJSONFeatures
                }
                else if (Array.isArray(dataObj["@context"]) && dataObj["@context"].length > 0){
                    if(!(dataObj["@context"].includes("http://iiif.io/api/presentation/3/context.json") || dataObj["@context"].includes("https://iiif.io/api/presentation/3/context.json"))){
                        alert("The IIIF resource type does not have the correct @context.")
                        return geoJSONFeatures
                    }
                }
                else if(typeof dataObj["@context"] === "object"){
                    alert("We cannot support custom context objects.  You can include multiple context JSON files.  Please include the latest IIIF Presentation API 3 context.")
                    return geoJSONFeatures
                }
            break
            default:
                alert("The data resource type is not supported.  It must be a IIIF Presentation API 3 'Manifest', 'Canvas', 'Annotation' or 'AnnotationPage'.  Please check the type.")
        }
        let hasNavPlace = false

        //Continue on and process
        if(resourceType === "Collection"){

        }
        else if(resourceType === "Manifest"){
            let manifestGeo = {}
            let geos= []
            let itemsGeos = []
            if(dataObj.hasOwnProperty("navPlace")){
                /**
                 * Remember these are feature collections.  We just want to move forward with the features.
                 * We are doing this so we can combine FeatureCollections with child items' features
                 * If we only draw specifically for the resource handed in and not its children, we could move forward with the feature collection.
                 */ 
                if(dataObj.navPlace.features){
                    //It is embedded
                    manifestGeo = dataObj.navPlace.features
                    //Is there something custom you want to do?  Do you want to add Manifest data to the GeoJSON.properties?
                    manifestGeo = manifestGeo.map(f => {
                        //dataObj is the Manifest.  Grab a property, like seeAlso
                        //f.properties.seeAlso = dataObj.seeAlso 
                        return f
                    })
                }
                else{
                    //It could be referenced
                    let fid = dataObj.navPlace.id ?? dataObj.navPlace["@id"] ?? "Yikes"
                    if(fid){
                        manifestGeo = await fetch(fid)
                        .then(resp => resp.json())
                        .then(featureCollection => {
                            //Is there something custom you want to do?  Do you want to add Manifest data to the GeoJSON.properties?
                            let collectionGeo = featureCollection.features
                            collectionGeo = collectionGeo.map(f => {
                                //dataObj is the Canvas.  Grab a property, like seeAlso
                                //f.properties.seeAlso = dataObj.seeAlso 
                                return f
                            })
                            return collectionGeo
                        })
                        .catch(err => {
                            console.error(err)
                            return []
                        })    
                    }
                }
                geos.push(manifestGeo)
            }
            /*
             * Also the Canvases??
            */
            if(dataObj.hasOwnProperty("items") && dataObj.items.length){
                itemsGeos = dataObj.items
                    .filter(item => {
                        //We only care about Canvases, I think.  Ignore everything else
                        let itemType = item.type ?? item["@type"] ?? "Yikes"
                        return (item.hasOwnProperty("navPlace") && itemType === "Canvas")
                    })
                    .map(canvas => {
                        //Is there something custom you want to do?  Do you want to add Canvas data to the features?
                        let canvasGeo = canvas.navPlace.features
                        canvasGeo = canvasGeo.map(f => {
                            //Grab a property from the Canvas, like seeAlso
                            //f.properties.seeAlso = canvas.seeAlso 
                            return f
                        })
                        return canvasGeo
                    })
            }
            //Yes, the internal items too...draw it all
            geoJSONFeatures = [...geos, ...itemsGeos]
            return geoJSONFeatures
        }
        else if (resourceType === "Range"){

        }
        else if(resourceType === "Canvas"){
            let canvasGeo = {}
            if(dataObj.hasOwnProperty("navPlace")){
                hasNavPlace = true
                //Remember these are feature collections.  We just want to move forward with the features.
                if(dataObj.navPlace.features){
                    //It is embedded
                    canvasGeo = dataObj.navPlace.features
                    //Is there something custom you want to do?  Do you want to add Canvas data to the GeoJSON.properties?
                    geoJSONFeatures = canvasGeo.map(f => {
                        //dataObj is the Manifest.  Grab a property, like seeAlso
                        //f.properties.seeAlso = dataObj.seeAlso 
                        return f
                    })
                }
                else{
                    //It could be referenced
                    let fid = dataObj.navPlace.id ?? dataObj.navPlace["@id"] ?? ""
                    if(fid){
                        geoJSONFeatures = await fetch(fid)
                        .then(resp => resp.json())
                        .then(featureCollection => {
                            let collectionGeo = featureCollection.features
                            //Is there something custom you want to do?  Do you want to add Canvas data to the GeoJSON.properties?
                            collectionGeo = collectionGeo.map(f => {
                                //dataObj is the Canvas.  Grab a property, like seeAlso
                                //f.properties.seeAlso = dataObj.seeAlso 
                                return f
                            })
                            return collectionGeo
                        })
                        .catch(err => {
                            console.error(err)
                            return []
                        })    
                    }
                }
                return geoJSONFeatures
            }
        }
        else{
            // There is no way for me to get the features, I don't know where to look.
            alert("Unable to get GeoJSON Features.  The resource type is unknown and I don't know where to look.")
            return geoJSONFeatures
        }
    }
    else{
        console.error("URI did not resolve and so was not dereferencable.  There is no data.")
        return geoJSONFeatures
    }
}

/**
 * Initialize the application by gathering all GeoJSON-LD Web Annotations from RERUM and 
 * formatting them appropriately for the given open source Web map.  Leaflet and MapML are supported.
 * @param {type} view
 * @return {undefined}
 */
GEOLOCATOR.init =  async function(){
    let latlong = [12, 12] //default starting coords
    let geos = []
    let resource = {}
    //document.getElementById("leafLat").oninput = GEOLOCATOR.updateGeometry
    //document.getElementById("leafLong").oninput = GEOLOCATOR.updateGeometry
    let geoJsonData = []
    let IIIFdataInURL = GEOLOCATOR.getURLVariable("iiif-content")
    let dataInURL = IIIFdataInURL
    if(!IIIFdataInURL){
        //Support other patterns?
        dataInURL = GEOLOCATOR.getURLVariable("data-uri")
    }
    if(dataInURL){
        //Let's pretend consumeForGeoJSON does everything we want with each feature's properties.
        //For now, I have added the properties to the GeoJSON in canvas_navplace.json
        geoJsonData = await GEOLOCATOR.consumeForGeoJSON(dataInURL)
        .then(geoMarkers => {return geoMarkers})
        .catch(err => {
            console.error(err)
            return []
        })
    }
    let formattedGeoJsonData = geoJsonData.flat(1) //AnnotationPages and FeatureCollections cause arrays in arrays.  
    let topLevelResourceType = GEOLOCATOR.resource["@type"] ?? GEOLOCATOR.resource.type ?? "Yikes"
    let allGeos = formattedGeoJsonData.map(function(geoJSON){ 
        //Note that it is probably best you format the properties in consumeForGeoJSON() before getting here.
        //Top level resource agnostic
        if(!geoJSON.properties.hasOwnProperty("summary")){
            geoJSON.properties.summary = GEOLOCATOR.resource.summary ?? ""
        }
        //Top level resource agnostic
        if(!geoJSON.properties.hasOwnProperty("label")){
            geoJSON.properties.label = GEOLOCATOR.resource.label ?? ""
        }
        //Top level resource agnostic
        if(!geoJSON.properties.hasOwnProperty("thumb")){
            geoJSON.properties.thumb = GEOLOCATOR.resource.thumb ?? ""
        }
        //Only if top level resource is a Manifest.  If it is a Canvas, you will not know the Manifest id so easily here.
        if(!geoJSON.properties.hasOwnProperty("manifest")){
            if(topLevelResourceType === "Manifest"){
                geoJSON.properties.manifest = GEOLOCATOR.resource["@id"] ?? GEOLOCATOR.resource["id"] ?? "Yikes"
            }
        }
        //Only if top level resource is a Canvas.  If it is a Manifest, you will not know the Canvas id so easily here.
        if(!geoJSON.properties.hasOwnProperty("canvas")){
            if(topLevelResourceType === "Canvas"){
                geoJSON.properties.canvas = GEOLOCATOR.resource["@id"] ?? GEOLOCATOR.resource["id"] ?? "Sadness"
            }
        }
        return geoJSON
    })
    GEOLOCATOR.initializeLeaflet(latlong, allGeos)
}
    
GEOLOCATOR.initializeLeaflet = async function(coords, geoMarkers){
    GEOLOCATOR.mymap = L.map('leafletInstanceContainer')   
    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoidGhlaGFiZXMiLCJhIjoiY2pyaTdmNGUzMzQwdDQzcGRwd21ieHF3NCJ9.SSflgKbI8tLQOo2DuzEgRQ', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 19,
        id: 'mapbox.satellite', //mapbox.streets
        accessToken: 'pk.eyJ1IjoidGhlaGFiZXMiLCJhIjoiY2pyaTdmNGUzMzQwdDQzcGRwd21ieHF3NCJ9.SSflgKbI8tLQOo2DuzEgRQ'
    }).addTo(GEOLOCATOR.mymap);
    GEOLOCATOR.mymap.setView(coords,2);

    L.geoJSON(geoMarkers, {
        pointToLayer: function (feature, latlng) {
            let appColor = "#08c49c"
            return L.circleMarker(latlng, {
                radius: 8,
                fillColor: appColor,
                color: "#000",
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });
        },
        onEachFeature: GEOLOCATOR.pointEachFeature
    }).addTo(GEOLOCATOR.mymap)
    leafletInstanceContainer.style.backgroundImage = "none"
    loadingMessage.classList.add("is-hidden")
}

GEOLOCATOR.pointEachFeature = function (feature, layer) {
    //@id, label, description
    layer.hasMyPoints = true
    layer.isHiding = false
    let popupContent = ""
    if (feature.properties){
        if(feature.properties.label && Object.keys(feature.properties.label).length){
            popupContent += `<div class="featureInfo">`
            //let label = feature.properties.label.en[0] ?? "No english label."
            //Brute force loop all the languages and add them together, separated by their language keys.
            for(const langKey in feature.properties.label){
                let allLabelsForLang = 
                    feature.properties.label[langKey].length > 1 ? feature.properties.label.join(", ") :
                    feature.properties.label[langKey]
                popupContent += `<b>${langKey}: ${allLabelsForLang}</b></br>`
            }
            popupContent += `</div>`
        }
        if(feature.properties.summary && Object.keys(feature.properties.summary).length){
            popupContent += `<div class="featureInfo">`
            //let summary = feature.properties.summary.en[0] ?? "No english label."
            //Brute force loop all the languages and add them together, separated by their language keys.
            for(const langKey in feature.properties.summary){
                let allSummariesForLang = 
                    feature.properties.summary[langKey].length > 1 ? feature.properties.summary.join(", ") :
                    feature.properties.summary[langKey]
                popupContent += `<b>${langKey}: ${allSummariesForLang}</b></br>`
            }
            popupContent += `</div>`
        }
        if (feature.properties.thumb) {
            let thumbnail = feature.properties.thumb ?? ""
            popupContent += `<img src="${thumbnail}"\>`
        }
        if (feature.properties.manifest) {
            let manifest = feature.properties.manifest ?? ""
            popupContent += `<a href="https://projectmirador.org/embed/?iiif-content=${manifest}" target="_blank"><img src="https://www.qdl.qa/sites/all/themes/QDLTheme/css/img/logo_mirador.png"/></a>`
            popupContent += `<a href="https://uv-v3.netlify.app/#?c=&m=&s=&cv=&manifest=${manifest}" target="_blank"><img src="https://www.qdl.qa/sites/all/themes/QDLTheme/css/img/logo_uv.png"/></a>`
        }
        layer.bindPopup(popupContent)
    }
}

GEOLOCATOR.goToCoords = function(event, view  ){
    if(leafLat.value && leafLong.value){
        let coords = [leafLat.value, leafLong.value]
        switch(view){
            case "leaflet":
                GEOLOCATOR.mymap.flyTo(coords,8)
            break
            case "mapML":
//               the following should work
                GEOLOCATOR.mymap.zoomTo(coords[0], coords[1], 8)
            break
            default:
        }
        document.getElementById("currentCoords").innerHTML = "["+coords.toString()+"]"
        window.scrollTo(0, leafletInstanceContainer.offsetTop - 5)
    }
}
                      
/**
 * Check if the given object has a valid IIIF context associated with it
 * @param {type} obj
 * @return {Boolean}
 */
GEOLOCATOR.checkForIIIF = function(targetObj){
    if(targetObj["@context"]){
        if(Array.isArray(targetObj["@context"])){
            return targetObj["@context"].includes("http://iiif.io/api/presentation/3/context.json") || targetObj["@context"].includes("http://iiif.io/api/presentation/2/context.json")
        }
        else if(typeof targetObj["@context"] === "string"){
           return targetObj["@context"] === "http://iiif.io/api/presentation/3/context.json" || targetObj["@context"] === "http://iiif.io/api/presentation/2/context.json" 
        }
    }
    return false
}

GEOLOCATOR.getURLVariable = function(variable)
    {
        var query = window.location.search.substring(1);
        var vars = query.split("&");
        for (var i=0;i<vars.length;i++) {
                var pair = vars[i].split("=");
                if(pair[0] == variable){return pair[1];}
        }
        return(false);
    }
