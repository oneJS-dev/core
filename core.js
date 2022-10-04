/**
 * A functional programming oriented Javascript module. It allows to write your web app or native app using just plain functional vanilla JS.
 * This module provides optional features such as state management, routing, database access/storage and style theming.
 * Internally it leverages the power of React, Emotion and Firestore to provide this functionality.
 * @module oneCore
 */

//React Imports. Currently React does not provide ESM modules but UMD
import React from 'react';

// //Web vs Native specific differences
import {OSSPECIFICS} from '@onejs-dev/core/osSpecifics/osSpecifics';

//Conditionally import Firestore
if(OSSPECIFICS.firestore) {
   var {doc, collection, addDoc, setDoc, getDoc, deleteDoc, getDocs, onSnapshot} = OSSPECIFICS.firestore;
}

/**
* @description The operating system where the app is being executed: web, android or ios. 
* @type {String}
*/
export const os = OSSPECIFICS.os;

/**
* @description All the module internal global variables are properties of the ONEJS object. 
* @type {Object}
*/
var ONEJS = {
    //Database Module
    firestore: {},             //The firestore database to perform read/write operations
    idb: {},                   //The indexedDB database to perform read/write operations

    //State Module
    reactState: [],            //All the React variables part of the 'useState' hook
    reactSetState: [],         //All the React methods to set the state part of the 'useState' hook
    reactUrl: {},              //The current url for the app for React Native
    reactSetUrl: {},           //The set method for the reactUrl 'useState' hook
    urlStateVariables: [],     //The ids of the state variables that need to be updated on url changes 
    currentState: {},          //Current state of the app, containing the value of all state variables
    stateHistory: [],          //The history of modifications performed to the state
    stateHistorySize: 10,      //Maximum length for the stateHistory array. Limits the amout of modifications stored
    stateHistoryPosition: 0,   //Newest (current) state position is 0. Rewinding the state this value can be changed 

    //Components Module    
    memoizedComponents: [],    //React component structure is stored in this array using the name as index
    emotionCSSClasses: [],     //CSS classes compiled by emotion to avoid calling css() method on every state update

    //App Module
    appName: '',               //Name of the app. Used by indexedDB to avoid naming collisions
    appText: {},               //All the app texts to provide translation functionality
    os: window ? 'web' : (global ? 'native' : undefined),//Current operating system for the app
    theme: {default: {}},      //Theme variable values for the different flavors
    style: {},                 //Object containing all the different styles for the app
    iconGradients: new Map(),  //Stores the relation between the CSS or native gradient and the SVG gradient
};


//=============================================================================
// LANGUAGE SETUP: All the app strings can be saved into a configuration
// object containing the different translations for the languages supported.
// The language module aims to simplify translation of the app when the user
// switches to a different language.
//=============================================================================

/** 
* @description Retrieves the user's local language based on the navigator configuration.
* @returns {String} Returns the user's local language.
*/
export const getLanguage = () => {
    const localLanguage = localStorage.getItem('oneLanguage'); //Maybe concatenate app name provided in app().
    const userLanguage = OSSPECIFICS.userLanguage;
    return localLanguage ?? userLanguage;
}
/** 
* @description Sets the language defined by the user.
* @param {String} languageISOCode - Chosen language in ISO format.
*/
export const setLanguage = (languageISOCode) => {
    localStorage.setItem('oneLanguage', languageISOCode);
}
/** 
* @description It is used to update the value of the language on user input change events.
* Use-case: Call function oninput or onchange events on the template.
* @param {Object} event - User event containing the target value to update the language.
* * @example
* ```javascript
* input({onchange: updateLanguage});//Everytime time the input changes updates the value of 'event' and therefore the language
* ```
*/
export const updateLanguage = (event) => {
    if(event?.target) setLanguage(event.target?.value);
}
/** 
* @description Reads the text for a certain language based on the text id. 
* Prerequisites: Define all the texts in a single object and provide it as the "text" parameter to the app() function.
* @param {String} id - The id of the text to be fetched.
* @param {String} [language=user's default language] - The id of the text to be fetched.
* @example
* App Function Text Object Example
* ```javascript
* appText = {title: 'My App',  home: {en: 'home', es: 'casa'}}
* ```
* @example
* Function Call
* ```javascript
* readText('home') //Return 'home' for 'en' and 'casa' for 'es'
* ```
* @returns {String} Returns the text string for the corresponding language.
* @todo  Create website to send JS object with text configuration: {home: 'home', button: 'your input'} and return {home: {en: 'home', es: 'casa'}, 
* button: {en: 'your input', es: 'su input'}}. Use a translator API.
*/
export const readText = (id, language=getLanguage()) => {
    if(!ONEJS.appText) {console.error('The text has not been setup in the app function.'); return;}
    if(!ONEJS.appText[id]) {console.error('No such id: ' + id); return;}
    if(language && !ONEJS.appText[id][language]) {console.error('No such language: ' + language); return;}

    if(typeof ONEJS.appText[id] === 'string') return ONEJS.appText[id];
    return ONEJS.appText[id][language];//TODO: If not retrieved for a certain language automatically translate
}

//=============================================================================
// ROUTING SETUP: Internal methods to provide routing functionality for web.
// Dynamic and declarative, just setup the url property of the View component
// in order to:
// 1. Toggle visibility: If the actual url matches the url visible property  
//                       the element is displayed. 
// 2. Toggle active:     If the actual url matches the url active property  
//                       the element is displayed.
// 3. Link routing:      The element changes the actual url to match the url
//                       link property.
// Example: 
// const template => [View({url: {visible: '/home'}})('Home Screen'),
//                    View({url: {link: '/home', active: 'home'}})([
//                    Button()('Redirect to home screen'))];
//=============================================================================

/** 
* @description Checks if the target url matches the actual page url.
* Principles: All url-s must start with '/' because all url-s are absolute.
* Naming: '*' represents any value for a given segment. At the end of the url, e.g.'/path/to/end/*' means any number of segments after
* Note: The page root has a url '/'. This can only be matched by target url '/' or '* /'
* Note: Actual url ignores anchors (root/home/#anchor/path === root/home)
* @param {String} url - The url to be compared with the actual url.
* @example
* Function Call for Actual Url = '/path/to/page'
* ```javascript
*   matchUrl('/* /* /page') //Matches
*   matchUrl('/* /to')      //Does not match
*   matchUrl('/* /to/*')    //Matches
* ```
* @returns {Boolean} Returns true if the target url matches the actual url, false otherwise.
*/
export const matchUrl = (url) => {
    if(!url) return false;
    //Filter added to remove the empty strings after split. E.g.: Root path is "/" and split converts to ['', '']. Filter turns into []
    const actualUrlString = OSSPECIFICS.os === 'web' ? decodeURI(location.pathname + location.search) : ONEJS.reactUrl;
    const actualUrl = actualUrlString.split('/').filter(Boolean); //this url will always start with '/'
    const targetUrl = url.split('/').filter(Boolean);
    if(targetUrl.length - actualUrl.length > 1 || (targetUrl.length - actualUrl.length === 1 && targetUrl[targetUrl.length-1] !== '*')) return false;
    //Return false if the target url does not match at any stage
    for (let i = 0; i < actualUrl.length; i++) {
        if(i === targetUrl.length - 1 && targetUrl === '*') return true;
        if(actualUrl[i] !== targetUrl[i] && targetUrl[i] !== '*') return false;
    }
    return true;
}

/** 
* @description If the url matches the current path, returns the value from the segment with ':'.
* Naming: '*' represents any value for a given segment. ':' represents the segment to extract the data from.
* Use case: Users can type any id in the url and retrieves the specific item from the database.
* @param {String} url - The url to extract data from.
* @example
* Function Call for Actual Url = '/path/to/page'
* ```javascript
    readUrlData('/* /: /page') //Returns 'to' (not 'to/page')
    readUrlData('/* /: ')      //Does not match, returns undefined
    readUrlData('/* /: /*')    //Returns 'to'
    readUrlData('/* /in/*')    //Does not match, returns undefined
* ```
* @returns {String} Returns the value from the segment with ':'.
*/
const readUrlData = url => {        
    if(typeof url !== 'string') return;         //If not a string return undefined. This allows '' as a possible url.
    const urlToMatch = url.replace(':', '*');   //The url without the data ':' segments
    if(!matchUrl(urlToMatch)) {
        if(urlToMatch === url) return false;    //If the url does not match returns false (does not contain : segments)
        return; 
    } 
    else if(urlToMatch === url) return true;    //If the url does not contain a data ':' segment, return true if the url matches
    //Matches and contains ':' segments
    const actualUrlString = OSSPECIFICS.os === 'web' ? decodeURI(location.pathname + location.search) : ONEJS.reactUrl;
    const actualUrl = actualUrlString.split('/').filter(Boolean);
    const targetUrl = url.split('/').filter(Boolean);
    for(let i = 0; i < targetUrl.length; i++) {
        if(targetUrl[i] === ':') return actualUrl[i];
    }
    return;
}

/**
* @typedef  {Object}  Url - The configuration structure required by urlSetup function. It enables displaying or hiding the View based on the url, adding an
* 'active' attribute or making it clickable redirecting the user to the chosen url.
* Principles: All url-s must start with '/' because all url-s are absolute.
* Naming: '*' represents any value for a given segment. At the end of the url, e.g.'/path/to/end/*' means any number of segments after
* Note: The page root has a url '/'. This can only be matched by target url '/' or '* /'
* Note: Actual url ignores anchors (root/home/#anchor/path === root/home)
* ```javascript
* @example
*   //Actual Url = '/path/to/page'
*   matchUrl('/* /* /page') //Matches
*   matchUrl('/* /to')      //Does not match
*   matchUrl('/* /to/*')    //Matches
* @property {String}  [visible]             - The url for the component to be visible.
* @property {String}  [active]              - The url for the component to be active.
* @property {String}  [link]                - The url to be redirected to when clicking the component.
* @example
* ```javascript 
*   const myUrl = {visible: '/*', active: '/home/*', link: '/home'}
* ```
*/
/** 
* @description Enables routing for View components. 
* @param {Url} url - The url configuration to enable routing.
* @param {Function} onVisibleChange - Triggers the function with the 'visible' value (bool) as parameter when visbility needs to be modified due to url changes.
* @param {Function} onActiveChange - Triggers the function with the 'active' value (bool) as parameter when 'active' needs to be modified due to url changes.
* @param {Object} component - The DOM component to be animated.
* @example
* ```javascript 
*   View({visible: read('isVisible'), onVisibleChange: update('isVisible'), url: {visible: '/home1', link: 'home2'}})('hello world');
* ```
*/
const setupUrl = (url) => component => { //Setup animation on property changes
    const touchEvent = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)) ? 'press' : 'click';

    //If url is of type link. Redirects to the linked address
    //If a link does not start with '/', it gets appended to the last part of the url (relative). 
    //If starts with '/', it replaces from the root (absolute).
    if(typeof url === 'string') {
        component.addEventListener(touchEvent, async (e) => {
            e.preventDefault(); 
            if(matchUrl(url)) return; //If the current url matches the target url do nothing (avoid changing url)
            window.history.pushState(null, null, url); //data, title, url
            window.dispatchEvent(new CustomEvent('urlChange', {detail: url}));
        });
        if(!window.onpopstate) { //Popstate gets activated when pressing next or back buttons on the browser or calling history.back() history.go()
            window.onpopstate = (e) => {
                window.dispatchEvent(new CustomEvent('urlChange', {detail: decodeURI(location.pathname + location.search)}));
            };
        }
    }  
}

/** 
* @description Reads the current url to set the corresopnding state variable. Subscribes to url changes.
* Naming: '*' represents any value for a given segment. ':' represents the segment to extract the data from.
* Use case: Update the value of a state variable that uses url as source
* @param {String} url - The url to extract data from.
* @param {String} stateId - The state id where data will be stored.
* @example
* State Configuration:
* ```javascript
*   const state = {eventId: {source: {url: '/* /events/:'}}}
* ```
* Internal Function Call:
* ```javascript
*   //Actual url: '/path/events/event123'
*   readUrl('/* /events/:')('eventId'); //Sets eventId = 'event123'
* ```
*/
const readUrl = (url) => (stateId) => {
    write(stateId, readUrlData(url), 'url', 'update');
    ONEJS.urlStateVariables.push({url: url, stateId: stateId});
}

/** 
* @description Updates the url state variable for React Native apps.
* Naming convention:
*   - If the url starts with '/' it will be taken as an absolute path and the actual url will be fully replaced.
*   - If the url starts with './' or no '/' it will be taken as a relative path and will be appended to the actual url.
* @param {String} url - The new url to update the current url.
* @example
* Internal Function Call:
* ```javascript
*   //Actual url: '/home'
*   updateurl('/events'); //Actual Url = '/events'
*   updateurl('./sponsor'); //Actual Url = '/home/sponsor'
*   updateurl('partners'); //Actual Url = '/home/partners'
* ```
*/
const updateUrl = url => {
    if(typeof url !== 'string') return;
    let finalUrl = ONEJS.reactUrl;
    if(url === '') finalUrl = '/';
    else if(url.slice(0, 1) === '/') finalUrl = url;
    else if(url.slice(0, 2) === './') finalUrl = finalUrl + url.slice(2 - url.length);
    else finalUrl = finalUrl + url;
    ONEJS.reactSetUrl(finalUrl);
}

/** 
* @description Reads a database path with state variables '<stateId>'. The '<stateId>' variable holds the ID for the database item. 
* Use case: Return data from the database for a specific item. The <stateId> variable should only be used at document level, even if it may work at collection level.
* Naming: '<stateId>' represents the variable to be replaced with the value.
* Note: The function name says 'Path' rather than 'Url' since it reads both database paths and DOM http url.
* Note: Discriminants have been used '< >' as the stateId encoding character since they are not allowed in regular http urls.
* @param {String} path - The path to read <stateId> from.
* @example
* ```javascript 
*   const state = {eventId: 'event123', myEvent: source{firestore: {'events/<eventId>'}} }
*   readPathWithState('events/<eventId>') //eventId = 'event123', Returns 'events/event123'
*   readPathWithState('events/<eventId>') //eventId = undefined, Returns undefined
* ``` 
* @returns {String} Returns the path after replacing the '<stateId>' with the corresponding value.
* @todo Discarded idea: Besides @stateId, we could also implement :, to combine and retrieve the value for both the state and url data. (Creates confusion, final decision is to only use state variables)
*/
const readPathWithState = (path) => {
    let finalPath = path;
    //Path Includes State Variable
    if(finalPath.includes('<') && finalPath.includes('>')) {
        const stateId = (path.split('<')[1]).split('>')[0]; //Returns the stateId from in between the '<' '>' characters.
        if(read(stateId) != null) finalPath = finalPath.replace('<' + stateId + '>', read(stateId).toString());
        else return;//Returns undefined so that 'source/storage' functions avoid reading/writing from/to database
    }
    return finalPath;
}

//=============================================================================
// FIREBASE SETUP: This is an optional module that allows the user to work with
// the Firebase Firestore database in a declarative way.
// 1. Setup the firestore database in the index.js file
// const config = {apiKey: "---randomKey---", authDomain: "myApp.firebaseapp.com",
// const firebaseApp = initializeApp(config);//Initialize firebase      
// const firestoreDB = getFirestore();// Initialize Cloud Firestore after Firebase
// 2. Setup the state configuration to use firestore as the source or storge option
// const state = {events: {default: [], source: {firestore: 'events'}, 
//     storage: {firestore: 'events'}}, ...};
// 3. Intialize the app() function with the firestore database
// app({template: template, state: state, firestore:firestoreDB});
//
//=============================================================================

/** 
* @description Pull data from the firestore database on request. It can be a single document or full collection.
* Use case: Triggered by firestore read to pull data for dynamic paths (depending on the state)
* @param {String} path - The firestore path to read data from (even path: document, odd path: collection).
* @param {String} stateId - The state id of the variable that will be updated with the data from the database.
* @example
* ```javascript 
*   const state = {eventId: 'event123', myEvent: source{firestore: {'events/@eventId'}} }
*   firestoreGetDataOnce('events/@eventId')(myEvent);// If eventId = 'event123', sets myEvent = {obj} which is the database value for the path = 'events/event123'
* ``` 
*/
const firestoreGetDataOnce = async (path, stateId) => {
    if(!read(readStateId(path))) return; //If the state is not defined return undefined
    if(path.split('/').length % 2 === 0) {
        const docRef = doc(ONEJS.firestore, readPathWithState(path));
        try {
            const docSnap = await getDoc(docRef);
            if(docSnap.exists()) {write(stateId, docSnap.data(), 'firestore', 'update');} 
            else {console.error("No such document!");}//doc.data() will be undefined in this case
        }
        catch (error) {console.error("Error getting document:", error);}
    }
    else {
        const collRef = collection(ONEJS.firestore, readPathWithState(path));
        try {                    
            const collSnap = await getDocs(collRef);//doc.data() is never undefined for query doc snapshots
            const result = [];
            collSnap.forEach((doc) => {result.push({...{id:doc.id}, ...doc.data()})});//Adding the id to the result array for each document
            write(stateId, result, 'firestore', 'update');
        } catch (error) {console.error("Error reading snapshot: ", error);}                
    }         
}

/** 
* @description Reads a document or collection of documents from Firestore database and sets the corresponding state variable.
* Naming: Even number of segments in path for documents or even for collections (group of documents)
* @param {String} path - The firestore path to read data from.
* @param {String} stateId - The state id of the variable that will be updated with the data from the database.
* @param {String} context - The context that is requesting this data. This function writes the state using the 'firestore' context, this way read/write loops can be avoided
* @example
* Static Path Examples:
* ```javascript 
*    path = events           //Returns array of events []
*    path = events/event123  //Returns event object with id = event123 {}
* ```
* Dynamic Path Examples:
* ```javascript 
*   path = @collectionId    //Returns array of events []. This is not recommended for security reasons, state variables in the path should be at document level
*   path = events/@eventId  //Replaces @eventId (calling readPathWithState) with state variable value and returns event object
* ``` 
* @todo Discarded idea: Besides @stateId, we could also implement :, to combine and retrieve the value for both the state and url data. (Creates confusion as paths and urls are not the same)
*/
const firestoreRead = (path) => (stateId, context='') => {
    if(context === 'firestore') return;
    if(!path) return;
    else if(path.includes('@') && context === 'initialize') {//Subscribes for state changes during 'setupState' initialization
        window.addEventListener(readStateId(path) + 'stateChange',  async (e) => {firestoreGetDataOnce(path, stateId);}, false);//Called on state updates
        firestoreGetDataOnce(path, stateId);//Pulls data once for the first time
    }
    else if(context === 'initialize'){//Subscribe to firestore updates using 'onSnapshot'
        //If the path is even, Firestore DOCUMENT is retrieved
        if(path.split('/').length % 2 === 0) {
            try {const unsubscribe = onSnapshot(doc(ONEJS.firestore, path), (doc) => {write(stateId, doc.data(), 'firestore', 'update');});}
            catch (error) {console.error("Error reading snapshot: ", error);}
        }
        //If the path is odd, Firestore COLLECTION is retrieved (list of documents within a collection)
        else {
            try {
                const unsubscribe = onSnapshot(collection(ONEJS.firestore, path), (snapshot) => {
                    const result = [];
                    snapshot.forEach((doc) => {result.push({...{id:doc.id}, ...doc.data()})});  //Adding the id to the result array for each document
                    write(stateId, result, 'firestore', 'update'); //If storage is also set we will run into conflicts
                });
            } catch (error) {console.error("Error reading snapshot: ", error);}
        }
    } 
    else {  // Called for paths with state variables and stateId with source and storage. In these cases when the write function updates the stateId, since data
            // is not synced with 'onSnapshot', the 'source' function is called to pull the just stored data again from the database.
            // This is required since adding new data to the database generates a new id that needs to be retrieved for the app.
        firestoreGetDataOnce(path, stateId);
    }     
}

/** 
* @description Writes a document to Firestore database. For document paths, updates the document value. For collections, pushes document to collection.
* Naming: Even number of segments in path for documents or even for collections (group of documents)
* @param {String} path - The firestore path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'firestore' context. 
* The write function will call the storage function. Thanks to context the firestoreWrite function exits, this way read/write loops can be avoided.
* @param {String} documentId - Optional for collections. If the document id is specified, rather than pushing a new document, the corresponding documentId document is updated.
* @example
* ```javascript 
*   path = events;  documentID = 'event123'  
*                            data = {event}; //Updates {event123} with {event}
*   path = events;           data = {event}; //Pushes {event} to [events] collection
*   path = events/event123;  data = {event}; //Updates {event123} with {event}
*   path = @collection       data = {event}; //Warning: Not a good pattern to use variables at collection level for security reasons. 
*                                            //Replaces @collection with state variable value and adds a new document to the collection.
* ```
*/
const firestoreWrite = (path) => async (data, context = '', documentId) => {
    if(context === 'firestore') return;//This means firestore has read a value and is updating the state, no need to write to the database 
    if(!path) return;
    const finalPath = documentId != null ? readPathWithState(path).concat('/', documentId.toString()) : readPathWithState(path);
    //If the path is even, modify the document
    if(finalPath.split('/').length % 2 === 0) {
        try {const docRef = await setDoc(doc(ONEJS.firestore, finalPath), {...{timestamp: new Date().getTime()}, ...data});}
        catch(error) {console.error("Error writing document: ", error);} 
    }
    //If the path is odd, push document to collection. The id is automatically generade by firestore in the database
    else {
        try {const docRef = await addDoc(collection(ONEJS.firestore, finalPath), {...{timestamp: new Date().getTime()}, ...data});}
        catch(error) {console.error("Error purshing to collection: ", error);}
    }
}
/** 
* @description Removes a document from the Firestore database. It can remove collections of documents but it is strongly not advised.
* Naming: Even number of segments in path for documents or even for collections (group of documents)
* @param {String} path - The firestore path to the document. Number of segments should be even. Warning: If the path is odd, it will clear the entire collection.
* @param {String} documentId - Optional for collections. If the document id is specified, the corresponding document with id equal to documentId will be removed.
* @example
* ```javascript 
*   path = events;           data = {event}; //Removes entire events collection. Not advised.
*   path = events/event123;  data = {event}; //Removes document with id 'event123'
*   path = events/@eventId;  data = {event}; //Replaces @eventId (calling readPathWithState) with state variable value and removes document
* ```
*/
const firestoreRemove = (path) => async (documentId) => {
    if(!path) return;
    const finalPath = documentId != null ? readPathWithState(path).concat('/', documentId.toString()) : readPathWithState(path);
    //If the path is even, remove the document
    if(finalPath.split('/').length % 2 === 0) {
        try {const docRef = await deleteDoc(doc(ONEJS.firestore, finalPath));}
        catch(error) {console.error("Error removing document: ", error);} 
    }
    //If the path is odd, delete entire collection
    else {
        //To delete an entire collection or subcollection in Cloud Firestore, 
        //retrieve all the documents within the collection or subcollection and delete them
        //Deleting collections from a Web client is not recommended.
        const collRef = collection(ONEJS.firestore, readPathWithState(path));
        try {                    
            const collSnap = await getDocs(collRef);
            collSnap.forEach(async docData => await deleteDoc(doc(ONEJS.firestore, finalPath + '/' + docData.id)));
        } catch (error) {console.error("Error reading snapshot: ", error);}  
    }    
}


//=============================================================================
// INDEXED DATABASE SETUP: This is an optional module that allows the user to work
// with the web-native indexedDB database in a declarative way.
// 1. Setup the state configuration to use firestore as the source or storge option
// const state = {events: {default: [], source: {indexedDB: 'events'}, 
//     storage: {indexedDB: 'events'}}, ...};
// 2. Intialize the app() function with the firestore database
// app({template: template, state: state});
//
//=============================================================================

/** 
* @description Reads document/collection from indexedDB API.
* Naming: 2 number of segments in path for documents or 1 for collections (group of documents). As opposed to firebase, there are no nested collections.
* Use-case: Online storage (Firestore) is oriented to store information from all users. Local storage aims to store information from current user only (e.g: Settings).
* References: 
* [Google Tutorial]{@link https://developers.google.com/web/ilt/pwa/working-with-indexeddb}
* [W3 Tutorial]{https://www.w3.org/TR/IndexedDB-2/}
* [Can I Use]{https://caniuse.com/#feat=indexeddb2}
* @param {String} path - The indexedDB path to the document or collection to be retrieved.
* @param {String} stateId - The id of the state variable that will store the retrieved data.
* @param {String} context - The context that is requesting this data. This function writes the state using the 'indexedDB' context, 
* it will exit if read is called again with 'indexedDB' context. This way read/write loops can be avoided

* @example
* Static Path Examples:
* ```javascript 
*    path = events           //Returns array of events []
*    path = events/event123  //Returns event object with id = event123 {}
* ```
* Dynamic Path Examples:
* ```javascript 
*   path = @collectionId    //Returns array of events []. This is not recommended for security reasons, state variables in the path should be at document level
*   path = events/@eventId  //Replaces @eventId (calling readPathWithState) with state variable value and returns event object
* ``` 
*/
const indexedDBRead = (path) => (stateId, context='') => {
    if(context === 'indexedDB') return;
    if(!path) return;
    if(path.includes('@') && context === 'initialize') {//Subscribes for state changes during 'setupState' initialization
        window.addEventListener(readStateId(path) + 'stateChange',  async (e) => {//Note: e.detail also contains the newState
            if(!read(readStateId(path))) return;//If the state is not defined return.
            const pathSegments = readPathWithState(path).split('/').filter(Boolean);
            try {
                const transaction = ONEJS.idb.transaction(pathSegments[0], 'readonly');
                const store = transaction.objectStore(pathSegments[0]);
                const request = pathSegments.length > 1 ? store.get(pathSegments[1]) : store.getAll();//Depending of path segments, read entire collection or specific document
                request.onsuccess = function(data) {write(stateId, request.result, 'indexedDB', 'update');};
                request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
            } 
            catch(error) {console.error("Error getting document:", error);}
        }, false);
    }
    // As opposed to Firestore's 'onSnapshot' method, there is no option to observe changes in indexedDB. Therefore the 'read' function
    // is triggered everytime the 'write' function is called.
    const pathSegments = readPathWithState(path).split('/').filter(Boolean);
    try {
        const transaction = ONEJS.idb.transaction(pathSegments[0], 'readonly');
        const store = transaction.objectStore(pathSegments[0]);
        const request = pathSegments.length > 1 ? store.get(pathSegments[1]) : store.getAll();//Depending of path segments, read entire collection or specific document
        request.onsuccess = function(data) {write(stateId, request.result, 'indexedDB', 'update');};
        request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
    }
    catch(error) {console.error("Error getting document:", error);}
} 
/** 
* @description Writes a document to indexedDB database. For document paths, updates the document value. For collections, pushes document to collection.
* Naming: 2 number of segments in path for documents or 1 for collections (group of documents). As opposed to firebase, there are no nested collections.
* @param {String} path - The indexedDB path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'indexedDB' context. 
* The write function will call the storage function. Thanks to context the indexedDBWrite function exits, this way read/write loops can be avoided.
* @param {String} documentId - Optional for collections. If the document id is specified, rather than pushing a new document, the corresponding documentId document is updated.
* @example
* ```javascript 
*   path = events;  documentID = 'event123'  
*                            data = {event}; //Updates {event123} with {event}
*   path = events;           data = {event}; //Pushes {event} to [events] collection
*   path = events/event123;  data = {event}; //Updates {event123} with {event}
*   path = @collection       data = {event}; //Warning: Not a good pattern to use variables at collection level for security reasons. 
*                                            //Replaces @collection with state variable value and adds a new document to the collection.
*   path = events/@eventId;  data = {event}; //Replaces @eventId (calling readPathWithState) with state variable value and updates document with {event}
* ```
*/   
const indexedDBWrite = (path) => (data, context='', documentId) => {
    if(context === 'indexedDB') return;
    if(!path) return;
    const pathSegments = readPathWithState(path).split('/').filter(Boolean);
    if(documentId != null) {//Update specific document within collection 
        pathSegments[1] = documentId;
        data.id = documentId;
    }
    try {
        const transaction = ONEJS.idb.transaction(pathSegments[0], 'readwrite');
        const store = transaction.objectStore(pathSegments[0]);
        //Due to the { keyPath: "id", autoIncrement: true } configuration .put() function does not need the document id, it needs to be contained in the data object
        const request = pathSegments.length > 1 ? store.put(data) : store.add(data);//To add to collection or update document
        request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
    } 
    catch(error) {console.error("Error writing document:", error);}
}
/** 
* @description Removes a document or collection of documents from the indexedDB database.
* Naming: 2 number of segments in path for documents or 1 for collections (group of documents). As opposed to firebase, there are no nested collections.
* Note: In this case, it is rather safe to clear entire collection as it is contained within the users memory and not a global database online as it is for Firestore.
* @param {String} path - The indexedDB path to the document. Number of segments should be even. Warning: If the path is odd, it will clear the entire collection.
* @param {String} documentId - Optional for collections. If the document id is specified, the corresponding document with id equal to documentId will be removed.
* @example
* ```javascript 
*   path = events;           //Removes entire events collection. Not advised.
*   path = events/event123;  //Removes document with id 'event123'
*   path = events/@eventId;  //Replaces @eventId (calling readPathWithState) with state variable value and removes document
* ```
*/
const indexedDBRemove = (path) => (documentId) => {
    if(!path) return;
    const pathSegments = readPathWithState(path).split('/').filter(Boolean);
    if(documentId != null) pathSegments[1] = parseInt(documentId);
    try {
        const transaction = ONEJS.idb.transaction(pathSegments[0], 'readwrite');
        const store = transaction.objectStore(pathSegments[0]);
        const request = pathSegments.length > 1 ? store.delete(parseInt(pathSegments[1])) : store.clear();//To remove entire collection or specific document
        request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
    } 
    catch(error) {console.error("Error removing document:", error);}
}

//=============================================================================
// LOCAL STORAGE: This is an optional module that allows the user to work
// with the web-native localStorage database in a declarative way.
// localStorage is similar to sessionStorage, except that while localStorage data 
// has no expiration time, sessionStorage data gets cleared when the page session
// end. Data is internally stored in string format.
// 1. Setup the state configuration to use 'local' as the source or storge option
// const state = {userId: {default: '', source: {local: 'userId'}, 
//     storage: {local: 'userId'}}, ...};
// 2. Use the read and update functions to access the data and store a new value
// respectively
// const template = () => [Text()('User Id: ' + read('userId')),
//                         Input({type:'text', onInput: update('userId')})]              
//=============================================================================

/** 
* @description Reads document from localStorage API.
* Naming: It is a flat structure, there are no collections.
* Use-case: Online storage (Firestore) is oriented to store information from all users. Local storage aims to store information from current user only (e.g: Settings).
* References: 
* [W3 Tutorial]{https://www.w3.org/jsref/prop_win_localstorage.asp}
* @param {String} path - The indexedDB path to the document or collection to be retrieved.
* @param {String} stateId - The id of the state variable that will store the retrieved data.
* @example
* ```javascript 
*    path = userId //Returns the stored value for userId {id: '123', name: 'user'}
* ```
*/
const localStorageRead = (path) => (stateId) => {
    try {        
        const jsonValue = localStorage.getItem(path); //Note that variable paths are not accepted here. Virtually no use-case for this.
        if(jsonValue === null) return;                //The Web Storage Specification requires that .getItem() returns null for an unknown key
        const data = JSON.parse(jsonValue);           //Using JSON.parse and stringify() allows to store non-string data.
        write(stateId, data, 'localStorage', 'update');
    } 
    catch(error) {console.error("Error getting document:", error);}
}
/** 
* @description Writes a document to localStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The localStorage path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'local' context. 
* The write function will call the storage function. Thanks to context the localStorageWrite function exits, this way read/write loops can be avoided.
* @example
* ```javascript 
*   path = 'userData'; data = {id: '123', name: 'user'}; //Pushes {data} in 'userData' document
* ```
*/  
const localStorageWrite = (path) => (data, context ='') => {
    if(context === 'localStorage') return;
    try {
        const jsonData = JSON.stringify(data)
        localStorage.setItem(path, jsonData);
    } 
    catch (error) {console.error("Error setting document:", error);} 
}
/** 
* @description Removes a document from localStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The localStorage path to the document.
* @example
* ```javascript 
*   path = userId; //Removes userId document
* ```
*/
const localStorageRemove = (path) => () => {
    try {
        localStorage.removeItem(path);
    } 
    catch(error) {console.error("Error removing document:", error);}
}

//=============================================================================
// NATIVE STORAGE: This is an optional module that allows the user to work
// with the React Native AsyncStorage database in a declarative way.
// Community Package: https://github.com/react-native-async-storage/async-storage.
// 1. Setup the state configuration to use 'local' as the source or storge option
// const state = {userId: {default: '', source: {local: 'userId'}, 
//     storage: {local: 'userId'}}, ...};
// 2. Use the read and update functions to access the data and store a new value
// respectively
// const template = () => [Text()('User Id: ' + read('userId')),
//                         Input({type:'text', onInput: update('userId')})]              
//=============================================================================
/** 
* @description Reads document from AsyncStorage API.
* Naming: It is a flat structure, there are no collections.
* Use-case: Online storage (Firestore) is oriented to store information from all users. Native storage aims to store information from current user only (e.g: Settings).
* References: 
* [Async Storage Docs]{https://react-native-async-storage.github.io/async-storage/}
* @param {String} path - The indexedDB path to the document or collection to be retrieved.
* @param {String} stateId - The id of the state variable that will store the retrieved data.
* @example
* ```javascript 
*    path = userId //Returns the stored value for userId {id: '123', name: 'user'}
* ```
*/
const nativeStorageRead = (path) => async (stateId) => {
    try { 
        const jsonValue = await OSSPECIFICS.AsyncStorage.getItem(path);   //Note that variable paths are not accepted here. Virtually no use-case for this.
        if(jsonValue === null) return;                      //The Async Storage Specification requires that .getItem() returns null for an unknown key
        const data = JSON.parse(jsonValue);                   //Using JSON.parse and stringify() allows to store non-string data.
        write(stateId, data, 'AsyncStorage', 'update');
    } 
    catch(error) {console.error("Error getting document:", error);}
}
/** 
* @description Writes a document to AsyncStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The AsyncStorage path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'local' context. 
* The write function will call the storage function. Thanks to context the AsyncStorageWrite function exits, this way read/write loops can be avoided.
* @example
* ```javascript 
*   path = 'userData'; data = {id: '123', name: 'user'}; //Pushes {data} in 'userData' document
* ```
*/  
const nativeStorageWrite = (path) => async (data, context ='') => {
    if(context === 'AsyncStorage') return;
    try {
        const jsonData = JSON.stringify(data);
        await OSSPECIFICS.AsyncStorage.setItem(path, jsonData);
    } 
    catch (error) {console.error("Error setting document:", error);} 
}

/** 
* @description Removes a document from AsyncStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The AsyncStorage path to the document.
* @example
* ```javascript 
*   path = userId; //Removes userId document
* ```
*/
const nativeStorageRemove = (path) => async () => {
    try {
        await OSSPECIFICS.AsyncStorage.removeItem(path);
    } 
    catch(error) {console.error("Error removing document:", error);}
}

//=============================================================================
// STATE: The state represents the mutable dimension of the app. Following a pure
// functional programming paradigm, all the functions give the same output provided
// with the same input (immutability) and do not change the state internally (no
// side effects).
// All the state of the app is contained in a single object and is created through
// the configuration provided.
// In order to modify the state, the user can use the read, add, update and remove
// functions in the app template (never inside components).
// 1. Define all the mutable variables required for the app and how they will be 
// sourced and stored. Use a single provider for each state variable (E.g.: do not
// mix firestore and indexedDB)
// 2. Use the read, add, update and remove functions to modify the state based on
// user actions (click, input, drag, etc.).
//=============================================================================

/** 
* @summary Reads the current value of the corresponding state variable.
* @description This is the main function to return the current value for the state variable of the app.
* Structure functions (components) cannot access or modify state, they can only generate events and the functions input for those events can modify the state.
* Use-case: Used within the template to access the variables needed to render the app. When these variables are modified, the rerender function 
* is called again getting the new state of the app.
* @param {String} stateId - The unique name given to the state variable.
* @example
* ```javascript 
*   const state = {toWhom: {default: 'World'}};
*   const template = () => Text()('Hello ' + read('toWhom') + '!');
* ```
* @returns {String} Returns the value for the corresponding state variable.
*/ 
export const read = (stateId) => {
    // return ONEJS.reactState[stateId];//Not reading from React directly as writing the state takes some time and when read is called the value is not updated.
    // return ONEJS.currentState[stateId] != null ? ONEJS.currentState[stateId].value : undefined;
    return ONEJS.currentState[stateId]?.value;
}

/** 
* @description Internal function to modify the state. It is the only function able to access and modify the state.
* Use-case: This function is called internally to write a new value into the state variable and save the value in the storage.
* @param {String} stateId - The unique name given to the state variable.
* @param {*} newValue - The new value to be written in the state variable.
* @param {String} context - The context that is requesting the write. Externally the 'app' context will be used. Internally: local, firestore or indexedDB.
* @param {String} action - The type of action that will be performed on the state: add, remove, update or updateArray.
* @param {String} documentId - For array operations, it is the element in the array that needs to be modified.
* @example
* ```javascript 
*   write('events', {id: '123', name: {'party'}}, 'app', 'arrayUpdate', '123');
* ```
*/ 
const write = (stateId, newValue, context = '', action='update', documentId) => {
    const oldValue = ONEJS.currentState[stateId].value;
    if(oldValue === newValue) return;
    
    if(action === 'add') {//Adds value to array state variable
        ONEJS.currentState[stateId].value.push(newValue);
        ONEJS.reactSetState[stateId]([... ONEJS.currentState[stateId].value]);//We need to clone the array with the spread syntax, otherwise leads to unexpected behaviour.
    }
    else if(action === 'remove') {
        if(documentId != null) {//Remove value from array state variable
            ONEJS.currentState[stateId].value.splice(ONEJS.currentState[stateId].value.findIndex(doc => doc.id === documentId), 1);
             ONEJS.reactSetState[stateId]([... ONEJS.currentState[stateId].value]);
        }
        else {//Remove the value from the state variable
            newValue = Array.isArray(oldValue) ? [] : undefined;
            ONEJS.currentState[stateId].value = newValue;
            ONEJS.reactSetState[stateId](newValue);//*REACT SPECIFIC: Use setState function to update the state and trigger rerender*
        }
    }
    else if(action === 'updateArray') {//Update value from array state variable
        ONEJS.currentState[stateId].value[ONEJS.currentState[stateId].value.findIndex(doc => doc.id === documentId)] = newValue;
        ONEJS.reactSetState[stateId]([... ONEJS.currentState[stateId].value]);
    }
    else if(action === 'update') {//Update value from state variable
        ONEJS.currentState[stateId].value = newValue;
        ONEJS.reactSetState[stateId](newValue);//*REACT SPECIFIC: Use setState function to update the state and trigger rerender*
    }
    else return;

    if(context === 'stateHistory') return;//If the context is 'stateHistory' do not perform any actions on thre database
    saveState(stateId, oldValue, ONEJS.currentState[stateId].value, context, action, documentId);//Save the state configuration delta to be able to track the history of the state

    if(ONEJS.currentState[stateId].removal && action === 'remove') ONEJS.currentState[stateId].removal(documentId);
    if(ONEJS.currentState[stateId].storage && action !== 'remove') ONEJS.currentState[stateId].storage(newValue, context, documentId);//Context checks if the source path is equal to the target path to avoid calling storage innecessarity
    if(ONEJS.currentState[stateId].onChange) ONEJS.currentState[stateId].onChange(oldValue, newValue, stateId);//Called to performe additional actions on change
    if(ONEJS.currentState[stateId].alert) window.dispatchEvent(new CustomEvent(stateId + 'stateChange', {detail: newValue}));//Called when the state variable is required to alert when changes by other state var. E.g.: user: /users/@userId, userID: '1234' (watched variable)
    if(ONEJS.currentState[stateId].source && action === 'add') ONEJS.currentState[stateId].source(stateId, context);//When adding a new document into a collection, source is called to retrieve from the database the id for the recently added document.
}

/** 
* @description External function to modify the state. Adds a new value into the state variable array and saves it in the storage.
* Use-case: Used to add a new document to the collection in the database.
* Note: The reason why the second argument 'event' is curried, is to allow to pass this function to user events (E.g: onInput, onClick), in these cases,
* the event.target.value (e.target.checked in the case of checkbox) holds the new value to be updated.
* @param {String} stateId - The unique name given to the state variable.
* @param {*} event - The event containing the value or the value itself.
* @example
* ```javascript 
*   const template = () => [Input({ type: 'text, onInput: add('events') })];
*   const template = () => [Button({ onClick: (e) => add('events')({id: '123', name: {'party'}}) })]; 
* ```
*/ 
export const add = (stateId) => event => {
    const newValue = (event?.target) ? (event.target.type === 'checkbox' ? event.target.checked : event.target.value) : event;
    const context = 'app';//External context
    const action = 'add';
    write(stateId, newValue, context, action);
}

/** 
* @description External function to modify the state. Updates the value of state variables on input change events and saves it in the storage.
* Use-case: React to user events updating the state.
* Note: The reason why the second argument 'event' is curried, is to allow to pass this function to user events (E.g: onInput, onClick), in these cases,
* the event.target.value (e.target.checked in the case of checkbox) holds the new value to be updated.
* @param {String} stateId - The unique name given to the state variable.
* @param {String} documentId - If the state is an array of objects, corresponds to the {id} property within the object to be matched.
* @param {*} event - The event containing the value or the value itself.
* @example
* ```javascript 
*   const template = () => [Input({ type: 'text, onInput: update('userId') })]; //Everytime the input changes updates the value of 'user'
*   const template = () => [Button({ onClick: (e) => update('events', '123')({name: 'new party'}) })]; //Everytime is clicked sets the same value
* ```
*/
export const update = (stateId, documentId) => (event) => {
    // if(typeof constValue !== 'undefined') write(stateId, constValue);//For the moment not adding this option update = (stateId, constValue) => (event), it is anti-pattern
    const newValue = (event?.target) ? (event.target.type === 'checkbox' ? event.target.checked : event.target.value) : event;
    const context = 'app';//External context
    const action = documentId != null ? 'updateArray' : 'update';//Set the value within an array or update the value entirely
    write(stateId, newValue, context, action, documentId);
}

/** 
* @description External function to modify the state. Removes the value from the state variable on input change events and saves it in the storage.
* Use-case: React to user events removing the value from the state.
* @param {String} stateId - The unique name given to the state variable.
* @param {String} documentId - If the state is an array of objects, corresponds to the {id} property within the object to be matched.
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => remove('userId') })]; //Everytime is clicked sets 'userId' to undefined
*   const template = () => [Button({ onClick: (e) => remove('events', '123') })]; //Everytime removes event '123' from the 'events' array
* ```
*/
export const remove = (stateId, documentId) => { 
    const newValue = undefined;
    const context = 'app';//External context
    const action = 'remove';//Set the value within an array or update the value entirely
    write(stateId, newValue, context, action, documentId);
}

/**
* @typedef  {Object}  Config - The configuration structure required by setupState function.
* @property {*}       default               - The default value for the state.
* 
* @property {Object}  [source]              - Source for the state variable. If defined, choose one and only one of the providers below for each state variable.
* @property {String}  [source.url]          - The url to extract data from. The data segment is indicated with ':'
* @property {String}  [source.firestore]    - The path to the firestore document or collection.
* @property {String}  [source.indexedDB]    - The path to the indexedDB document or collection.
* @property {Array<String>}[source.collections] - Only for indexedDB using a state variable at collection level, declare all the collections to read from.
*                                                 Possibly removed in future updates, as it goes against database best practices.
* @property {String}  [source.local]        - The path to the local storage document.
* @property {Function}[source.function]     - A function to be called on every read (rerender). You may choose to pull data from your own database here. 
* 
* @property {Object}  [storage]             - Storage for the state variable. If defined, choose one and only one of the providers below for each state variable.
* @property {String}  [storage.firestore]   - The path to the firestore document or collection.
* @property {String}  [storage.indexedDB]   - The path to the indexedDB document or collection.
* @property {Array<String>}[storage.collections] - Only for indexedDB using a state variable at collection level, declare all the collections to write to.
*                                                 Possibly removed in future updates, as it goes against database best practices.
* @property {String}  [storage.local]       - The path to the local storage document.
* @property {Function}[storage.function]    - A function to be called on every write (state update). You may choose to push data to your own database here.
*  
* @property {Function}[onChange]            - A function to be called on every state read/write. Deprecated in favor of source.function and storage.function. 
*/

/** 
* @description Sets up the state based on the configuration object. All the state variables to be used and their default values need to declared in this configuration.
* @param {Config} config - The configuration required to set up the state of the app.
* @example
* ```javascript 
*   const config = {
*       userId: '123',
*       events: {default: [], source: {firestore: 'events'}, storage: {firestore: 'events'}},
*       selectedEventId: {default: '', source: {url: '/events/:'}},
*       selectedEvent: {default: {}, source: {firestore: 'events/@selectedEventId'}, storage: {firestore: 'events/@selectedEventId'}}
*   }
* ```
*/
const setupState = (config) => {
    const indexedDBCollections = [];  //All the collections required to be initialized for indexedDB 
    const indexedDBStateIds = {};     //All the state id-s that need to be updated with indexedDB data

    //1. Create all the state variables to make sure they exist
    Object.entries(config).forEach(([stateId, value]) => {
        //Set default value for state variable
        ONEJS.currentState[stateId] = {};
        // ONEJS.currentState[stateId].value = value?.default ?? value;
        if(value && typeof value === 'object' && value.hasOwnProperty('default')) ONEJS.currentState[stateId].value = value['default']; 
        else ONEJS.currentState[stateId].value = value;              
    });

    //2. Set the storage functions. They need to be set before source, as source functions modify the state
    Object.entries(config).forEach(([stateId, value]) => { 
        //If defined by the user, use Firestore as the storage option.
        if(value?.storage?.firestore) {
            ONEJS.currentState[stateId].storage = firestoreWrite(value.storage.firestore);
            ONEJS.currentState[stateId].removal = firestoreRemove(value.storage.firestore);
        }
        //If defined by the user, use IndexedDB as the storage option
        else if(value?.storage?.indexedDB) {
            ONEJS.currentState[stateId].storage = indexedDBWrite(value.storage.indexedDB);            
            ONEJS.currentState[stateId].removal = indexedDBRemove(value.storage.indexedDB);
            let collections = [value.storage.indexedDB.split('/').filter(Boolean)[0]];//Note: On collections better to avoid using state variables (@stateId)

            if(value.storage.collections && value.storage.collections.length) collections = value.storage.collections;//Array specifying which are the collections will be accessed. Only required for collection variable path.
            collections.forEach(collection=>{indexedDBCollections.indexOf(collection) === -1 ? indexedDBCollections.push(collection) : null;});
        }
        //If defined by the user, use Local Storage as the storage option
        else if(value?.storage?.local) {
            if(OSSPECIFICS.os === 'web') {
                ONEJS.currentState[stateId].storage = localStorageWrite(value.storage.local);
                ONEJS.currentState[stateId].removal = localStorageRemove(value.storage.local);
            }
            else if(OSSPECIFICS.os === 'ios' || OSSPECIFICS.os === 'android') {
                ONEJS.currentState[stateId].storage = nativeStorageWrite(value.storage.local);
                ONEJS.currentState[stateId].removal = nativeStorageRemove(value.storage.local);
            }
        }
        //If defined by the user, use any function to set the storage. It will be called on write()
        else if(value?.storage?.function) ONEJS.currentState[stateId].storage = value.storage.function;     
    });

    //3. set up the source functions and retrieve the initial values
    Object.entries(config).forEach(([stateId, value]) => {       
        //If defined by the user, use the url as the source of data
        if(value?.source?.url) {
            readUrl(value.source.url)(stateId);
        } 
        //If defined by the user, use Firestore database as the source of data.
        else if(value?.source?.firestore) {
            if(readStateId(value.source.firestore)) {
                ONEJS.currentState[readStateId(value.source.firestore)].alert = true;//In case the path includes a state variable, alert for changes
                ONEJS.currentState[stateId].source = firestoreRead(value.source.firestore);//This is required for collections, when we insert a document by querying the source we retrieve the document id
            }
            firestoreRead(value.source.firestore)(stateId, 'initialize');
        }     
        //If defined by the user, use IndexedDB as the source option
        else if(value?.source?.indexedDB) {
            ONEJS.currentState[stateId].source = indexedDBRead(value.source.indexedDB);
            if(readStateId(value.source.indexedDB)) ONEJS.currentState[readStateId(value.source.indexedDB)].alert = true;//In case the path includes a state variable, alert for changes
            let collections = [value.source.indexedDB.split('/').filter(Boolean)[0]];//Note: On collections better to avoid using state variables (@stateId)
            if(value.source.collections && value.source.collections.length) collections = value.source.collections;//Array specifying which are the collections will be accessed. Only required for collection variable path.
            collections.forEach(collection=>{indexedDBCollections.indexOf(collection) === -1 ? indexedDBCollections.push(collection) : null;});
            indexedDBStateIds[stateId] = value.source.indexedDB;
        }
        //If defined by the user, use Local Storage as the source option
        else if(value?.source?.local) {
            if(OSSPECIFICS.os === 'web') localStorageRead(value.source.local)(stateId);
            else if(OSSPECIFICS.os === 'ios' || OSSPECIFICS.os === 'android') nativeStorageRead(value.source.local)(stateId);
        }
        //If defined by the user, use any function to set the storage. It will be called on write()
        //Otherwise, user can use any function to source data for the state variable. It will be called once during setupState, the user should subscribe to changes to the source in this function to update the state. 
        else if(value?.source?.function) {
            ONEJS.currentState[stateId].source = value.source.function;
            ONEJS.currentState[stateId].source(stateId);
        }       
    });

    //Sets up the indexedDB tables to use as source/storage
    if(Object.keys(indexedDBCollections).length > 0) {
        if(!('indexedDB' in window)) {//Check for support
            console.error('IndexedDB not supported.');
            return;
        }
        //Check the current version and the collections setup in that version. If the collections change, increase the version number and store those collections
        const versionString = localStorage.getItem('oneIndexedDBVersion' + ONEJS.appName);
        let version = versionString ? parseInt(versionString) : undefined;
        let collectionsJson = localStorage.getItem('oneIndexedDBCollections' + ONEJS.appName);
        const collections = collectionsJson != null ? JSON.parse(collectionsJson) : undefined;
        
        if(!collections) {//No collections existing: Store collections and upgrade version
            collectionsJson = JSON.stringify(indexedDBCollections)
            localStorage.setItem('oneIndexedDBCollections' + ONEJS.appName, collectionsJson);
            if(!version) version = 1;
            else version = version + 1;
            localStorage.getItem('oneIndexedDBVersion' + ONEJS.appName, version);
        }

        //Missing collections: Store collections and upgrade version
        else if (!indexedDBCollections.every(collection => collections.includes(collection))){
            collectionsJson = JSON.stringify(indexedDBCollections)
            localStorage.setItem('oneIndexedDBCollections' + ONEJS.appName, collectionsJson);
            if(!version) version = 1;
            else version = version + 1;
            localStorage.getItem('oneIndexedDBVersion' + ONEJS.appName, version);
        }

        // indexedDB.deleteDatabase('oneIndexedDB' + ONEJS.appName);
        const openRequest = indexedDB.open('oneIndexedDB' + ONEJS.appName, version);//Open the database connection request

        //Called for new database or version number increase. The collections to be used (object stores) are declared here.
        //This is the only place to alter the structure of the database: create/remove object stores.
        openRequest.onupgradeneeded = function(e) {
            ONEJS.idb = e.target.result; //IDBDatabase object to create object stores and read/write later
            indexedDBCollections.forEach(path => {
                if (!ONEJS.idb.objectStoreNames.contains(path)) {
                    try{//https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB go to section: 'Structuring the Database'
                        ONEJS.idb.createObjectStore(path, {keyPath: 'id', autoIncrement: true}); //Can only hold JavaScript objects
                    }
                    catch(error) {console.error('IndexedDB Object Store could not be created: ' + error)}
                }
            });
        }
        //If the onupgradeneeded event exits successfully, the onsuccess function will be triggered. Reads the initial data from the database.
        openRequest.onsuccess = function(e) {
            ONEJS.idb = e.target.result;
            Object.entries(indexedDBStateIds).forEach(([stateId, path]) => {
                indexedDBRead(path)(stateId, 'initialize'); 
            });
        }
        openRequest.onerror = function(e) {console.error('IndexedDB Error');console.error(e);};
    }
}

/** 
* @description Internal function to store the state modification history. Since the state is the only modifiable part of the app, it allows to go back to previous states.
* Use-case: On every write() function call the modification is stored. 
* @param {String} stateId  - The unique name given to the state variable that is being modified.
* @param {*}      newValue - The new value to be written in the state variable.
* @param {*}      oldValue - The previous value to the state modification.
* @param {String} context  - The context used to  is requesting the write. Externally the 'app' context will be used. Internally: local, firestore or indexedDB.
* @param {String} action  - The type of action that modifies the state: add, remove, update or updateArray.
* @param {String} documentId - For array operations, it is the element in the array that needs to be modified.
* @example
* ```javascript 
*   saveState('events', {id: '123', name: {'party'}}, 'app', 'arrayUpdate', '123');
* ```
*/ 
const saveState = (stateId, oldValue, newValue, context, action, documentId) => {//0 is the current state, 1 would be the previous state, ... until stateHistorySize.
    if(context === 'stateHistory') return;//This occurs rewind or fastForward functions are being used, therefore no new state needs to be saved.
    if(ONEJS.stateHistoryPosition > 0) {//In case the history is rewinded and the state is modified, erase the previous path.
        ONEJS.stateHistory.splice(0, ONEJS.stateHistoryPosition);
        ONEJS.stateHistoryPosition = 0;
    }
    ONEJS.stateHistory.unshift({stateId: stateId, oldValue: oldValue, newValue: newValue, action: action, documentId: documentId, timestamp: new Date()});
    if(ONEJS.stateHistory.length > ONEJS.stateHistorySize) ONEJS.stateHistory.pop();
}

/** 
* @description External function to go to a certain point in the state modification history. It only works for 'update' events and does not undo database storage.
* @param {Number} statePosition - The unique name given to the state variable that is being modified.
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => goToState(4) })]; //Rewinds the state history to the slot number 4 in the array.
* ```
* @todo Implement reversal actions: add -> removeArray, update -> update, updateArray -> updateArray, remove -> update, removeArray -> add
* It is challenge to undo add action: for removeArray we need the id of the document added which is not stored. Knowing that 'add' always pushes the document 
* at the end of the array, it could be undone by always removing the last element.
*/
export const goToState = (statePosition) => {
    statePosition = parseInt(statePosition);
    if(statePosition < 0 || statePosition >= ONEJS.stateHistory.length) {
        console.error('Cannot rewind state to: ' + statePosition + '. It exceeds stateHistory.length.');
        return;
    }
    else if(statePosition === ONEJS.stateHistoryPosition) {
        return;
    }
    else if(statePosition > ONEJS.stateHistoryPosition) {
        for (let i = ONEJS.stateHistoryPosition; i < statePosition; i++) {
            write(ONEJS.stateHistory[i].stateId, ONEJS.stateHistory[i].oldValue, 'stateHistory');
        }
    }
    else {
        for (let i = ONEJS.stateHistoryPosition - 1; i >= statePosition; i--) {
            write(ONEJS.stateHistory[i].stateId, ONEJS.stateHistory[i].newValue, 'stateHistory');
        }
    }
    ONEJS.stateHistoryPosition = statePosition;
}
/** 
* @description Goes to the next (more recent) point in the modification history. 
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => nextState() })]; //Goes to the next state in the history
* ```
* @todo Until goToState() is fixed it is not production ready.
*/
export const nextState = () => {
    const statePosition = ONEJS.stateHistoryPosition - 1;
    goToState(statePosition);
}
/** 
* @description Goes to the previous (less recent) point in the modification history. 
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => previousState() })]; //Goes to the previous state in the history
* ```
* @todo Until goToState() is fixed it is not production ready.
*/
export const previousState = () => {
    const statePosition = ONEJS.stateHistoryPosition + 1;
    goToState(statePosition);
}
/** 
* @description Returns the complete stateHistory array containing the stored modifications to the state 
* @example
* ```javascript 
*   readStateHistory().map((value, index) => View()([ View()('Id: ' + value.stateId),
*                                                     View()('Old: ' + value.oldValue), 
*                                                     View()('New: ' + value.newValue) ]));
* ```
*/
export const readStateHistory = () => {
    return ONEJS.stateHistory;
}


//=============================================================================
// COMPONENTS: Components are functions that return a structure to be rendered.
// Every component should only be dependendent upon its input and does not modify 
// or maintain state.
// Arguments for component functions can be classified as:
// 1. Parameters: List of inputs unique to our component that are used to shape
//    the behaviour, structure or style.
// 2. Properties: All the properties required to define the componet providing its 
//    state. 
// 3. Attributes: All the possible attributes that can be input during the execution. 
//    E.g: class, hidden, id, etc.
// 3. Structure: Optional for components that can have an internal structure.
//    This arguments is curried. 
// Component Definition Example: 
// const myComponent = Component({param1 ='default1', paramN, ...attributes}={}) => 
//  structure => { 
//     return Div(attributes)([Text()('Hello World'), ...structure]);
//  }
// Component Styling Ordered by Priority:
// 1. Inline styles: These styles are inserted directly in the HTML tags. They are not 
//    compiled. As much as possible it is recommended to avoid this type.
// 2. Theme and flavor: This is the way to go when customizing componets. Flavor 
//    encapsulate css variables that allow to change the look and feel of the component
//    making it blend in with the app. One or more themes may be applied at a time.
// 3. Compiled styles:  These styles can act on nested elements and tags like :hover. 
//    They need to be compiled by emotion css into a class that is later assigned 
//    to the component.
//
// Intrinsic CSS Priority: 
// Inherited styles < * < element < attribute < class < ID < Combined selectors <
// < CSS properties set directly < on element, inside style attribute.
//=============================================================================

/** 
* @description Internal function to memoize component structure in a array to ensure the same reference is always returned.
* For memoize components, if properties do not change, React will skip rendering the component, and reuse the last rendered result.
* Memoizing components can be useful in the following scenarios:
* 1. Pure functional components
* 2. Renders often
* 3. Rerenders with same props
* 4. Medium to big size
* @param {Function | String} ComponentFunction - The component function to be memoized
* @param {Boolean} memoized - True: memoize the component, false: do not memoize the component
* @param {String} name - In order to memoize the component, it needs to be given a unique name.
* @example
* ```javascript 
*   memoizeComponent((props)=>Div()('Hello world'), true, 'div');
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const memoizeComponent = (ComponentFunction, memoized, name) => {
    let memoizedComponent = ComponentFunction;
    if(name) {
        if(!ONEJS.memoizedComponents[name]) ONEJS.memoizedComponents[name] = memoized ? React.memo(ComponentFunction) : ComponentFunction;
        memoizedComponent = ONEJS.memoizedComponents[name];
    }
    return memoizedComponent;
}

//=============================================================================
// COMPONENTS: Creation Higher Order Components (HOC)
//Whereas a component transforms props into UI, a higher-order component transforms 
// a component into another component: https://en.reactjs.org/docs/higher-order-components.html
// A set of internal functions that take the component function and wrap it to
// create a React element. This is required in order to be able to use hooks inside.
// They cannot be implemented inside the Component function as they would be
// generated everytime the app is rerendered generating a different memory reference.
// When this happens React is unable to compare and optimize changes for every
// iteration. 
// STEPS (wrapped components):
// 1. The user writes the component function.
// 2. The user creates the component by wrapping the component function with Component.
// 3.BaseComponent() function calls EnhancedComponent() to wrap the component function
//    in a HOC to provide more functionality.
// 4. Create<...> function creates the React element for the component wrapped by the
//    EnhancedComponent() function
//=============================================================================

/** 
* @description For a given component function, creates a React element that can hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization. The ComponentFunction has already been wrapped by EnhancedComponent().
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @param {Object} structure - The internal structure that will be passed during component instatiation.
* @example
* ```javascript 
*   CreateWrappedComponentWithStructure(props=>structure=>Div(props)(structure))({id: 'myId'})(Text()('Hello World'));
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateWrappedComponentWithStructure = (name, ComponentFunction) => ({...attributes}={}) => structure => {
    const memoized = memoizeComponent(ComponentFunction, attributes['memoized'], name);
    delete attributes['memoized'];
    return React.createElement(memoized, {structure: structure, ...attributes}, null);
}

/** 
* @description For a given component function, creates a React element that cannot hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization. The ComponentFunction has already been wrapped by EnhancedComponent().
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @example
* ```javascript 
*   CreateWrappedComponentWithoutStructure(props=>Input(props)({style: {background: 'blue'}});
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateWrappedComponentWithoutStructure = (name, ComponentFunction) => ({...attributes}={}) => {//Contar por que necesitamos un wrapper para usar los hooks en las funciones
    const memoized = memoizeComponent(ComponentFunction, attributes['memoized'], name);
    delete attributes['memoized'];
    return React.createElement(memoized, attributes); //React uses property "children" to setup the component internals
}

/** 
* @description For a given component function, creates a React element that can hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization.
* @param {String} name - Unique name for the Component.
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @param {Object} structure - The internal structure that will be passed during component instatiation.
* @example
* ```javascript 
*   CreateComponentWithStructure(props=>structure=>Div(props)(structure))({id: 'myId'})(Text()('Hello World'));
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateComponentWithStructure = (name, ComponentFunction) => ({...attributes}={}) => structure => {
    const uncurriedComponentFunction = ({structure, ...attributes} = {}) => ComponentFunction(attributes)(structure);
    const memoized = memoizeComponent(uncurriedComponentFunction, attributes['memoized'], name);
    delete attributes['memoized'];
    return React.createElement(memoized, {structure: structure, ...attributes}, null);
}

/** 
* @description For a given component function, creates a React element that cannot hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization. 
* @param {String} name - Unique name for the Component.
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @example
* ```javascript 
*   CreateComponentWithoutStructure(props=>Input(props)({style: {background: 'blue'}});
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateComponentWithoutStructure = (name, ComponentFunction) => ({...attributes}={}) => {
    if(name & attributes['memoized']) {//memoizeComponent cannot be called since passing the component function and returning the same reference creates a loop
        if(!ONEJS.memoizedComponents[name]) ONEJS.memoizedComponents[name] = React.memo(ComponentFunction);
        return React.createElement(ONEJS.memoizedComponents[name], attributes, null); 
    }
    return React.createElement(ComponentFunction, attributes, null); 
}

/** 
* @description For a given component function or tag, creates a React element that has been previously wrapped in a HOC to provide additional functionality: theming,
* style compilation and lifecycle functions. Base components are the building blocks of the app and represent the os native components.
* @param {String} name - Unique name for the Component.
* @param {Boolean} hasChildren - Specifies whether the Component can have user added structure.
* @param {Function} ComponentFunction - The component function to be created into a React element.* @example
* ```javascript 
*   WrappedComponent(props=>structure=>Text(props)(structure));
* ```
* @returns {ReactElement} - The enhanced React element.
*/
export const BaseComponent = (name, hasChildren, ComponentFunctionOrTag) => {
    if(hasChildren) return CreateWrappedComponentWithStructure(name, EnhancedComponent(ComponentFunctionOrTag));    
    return CreateWrappedComponentWithoutStructure(name, EnhancedComponent(ComponentFunctionOrTag));
}

/** 
* @description For a given component function, creates a React element. This is the main method to create your own custom components. 
* @todo In the future this could be renamed to 'BaseComponent' and the Div wrapping could be deprecated. Base components would be the os-native components that would
* be wrapped with this functionality. By using these components in a custom one, the functionality is extended.
* @param {String} name - Unique name for the Component.
* @param {Boolean} hasChildren - Specifies whether the Component can have user added structure.
* @param {Function} ComponentFunction - The component function to be created into a React element.
* @example
* ```javascript 
*   WrappedComponent(props=>structure=>Text(props)(structure));
* ```
* @returns {ReactElement} - The enhanced React element.
*/
export const Component = (name, hasChildren, ComponentFunction) => {
    if(hasChildren) return CreateComponentWithStructure(name, ComponentFunction);
    return CreateComponentWithoutStructure(name, ComponentFunction);
}

/** 
* @description A Higher Order Component (HOC) that provides additional functionality to the wrapped component for theming, inlineStyles, and lifecycle events.
* @param {Function | String} ComponentFunction - The component function to be wrapped and infused with enhanced functionality.
* @param {Object} structure - The internal structure that will be passed during component instatiation.
* @param {Array<String> | String} flavor - The chosen flavor(s) during instatiation. For this function only the flavor ids are required to set the corresponding
* CSS classes.
* @param {Array<Object> | Object} style - The style to be compiled into a css class.
* @param {Object} inlineStyle - The inline style chosen during instantiation.
* @param {String} url - The url to be redirected to on component click.
* @param {Function} onInit - Called once and only once before the component is mounted.
* @param {Function} onCreate - Called onComponentDidMount event. The function takes as inputs newValue and component.
* @example
* ```javascript 
*   const addListeners = (newValue, component) => component.addEventListener('click', async (e) => alert(newValue));
*   const MyComponent = BaseComponent('MyComponent', true, () => Div()())
*   const template = () => [MyComponent({onCreate: addListeners})]
* ```
* @param {Function} onDestroy - Called onComponentWillUnmount event. The function takes as inputs newValue and component.
* @param {Object} onPropertyChange - Called after onComponenDidMount event for every change in the value of the tracked properties.
* Takes an object whose keys are the properties tracked and the values the callback function. The function takes as inputs newValue and component.
* @example
* ```javascript 
*   EnhancedComponent(props=>Input(props)({style: {background: 'blue', flavor: 'danger', onCreate: addListeners}});
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const EnhancedComponent = (ComponentFunctionOrTag) => ({structure, flavor, style, inlineStyle, url, onInit, onCreate, onDestroy, onPropertyChange, ...attributes}={}) => {    
    //START CLASS SETUP: Web Specific. No class or className in React Native
    const classArray = [];
    if(OSSPECIFICS.os === 'web') {
        //Add instantiation class(es) to the class array
        if(attributes['class']) {Array.isArray(attributes['class']) ? classArray.push(...attributes['class']) : classArray.push(attributes['class']); delete attributes['class']}
        
        //Add flavor class to the class array
        // if(flavor?.flavorId) {
        //     if(Array.isArray(flavor.flavorId)) {classArray.push(...flavor.flavorId.map(flavorId => ONEJS.emotionCSSClasses['flavor'+flavorId]));}
        //     else classArray.push(ONEJS.emotionCSSClasses['flavor'+flavor.flavorId]);
        // }
        
        //Add compiled style class to the class array
        if(style) {//style can of Array type. The priority is from left (least priority) to write (most priority)
            classArray.push(OSSPECIFICS.css(style));
        }
        if(classArray.length) attributes['className'] = classArray.join(' '); //For the moment React uses className instead of class
        if(inlineStyle) attributes['style'] = inlineStyle;
        //END CLASS SETUP        
    }
    else if(OSSPECIFICS.os === 'ios' || OSSPECIFICS.os === 'android') attributes['style'] = style;//Sylesheet.create does not seem to provide any performance boost, only validation in dev. https://stackoverflow.com/questions/38886020/what-is-the-point-of-stylesheet-create

    //*REACT SPECIFIC* Lifecycle functions
    if(onInit) {//Similar to the deprecated ComponentWillMount. The limitation is that domNode is not yet available and cannot be accessed for changes. If this is needed wait until onCreate
        const initialized = React.useRef();
        if(!initialized.current) {
            onInit();
            initialized.current = true;
        }
    }

    if((url && OSSPECIFICS.os === 'web') || onCreate || onDestroy || onPropertyChange) {
        const domNode = React.useRef();
        attributes['ref'] = domNode;    
        if(url || onCreate || onDestroy) {//onCreate is equivalent to ComponentDidMount and onDestroy is equivalent to ComponentWillUnmount
            React.useEffect(() => { //React Effect: https://es.reactjs.org/docs/hooks-overview.html
                if(onCreate) onCreate(domNode.current);
                if(onDestroy) return onDestroy(domNode.current);
                if(url && OSSPECIFICS.os === 'web') setupUrl(url)(domNode.current)
            }, []);//The array is the properites for which it should trigger the change. If empty, then none. If no parameter, then all.        
        }
        if(onPropertyChange) {//onPropertyChange: {prop1: function1, prop2: function2};//Functions take (newValue, domNode)
            Object.entries(onPropertyChange).map(([property, callback]) => {  
                React.useEffect(() => {  
                    callback(attributes[property], domNode.current); //Equivalent to componentDidMount lifecycle call
                }, [attributes[property]]);
            });
        }
    } 
    if(url && (OSSPECIFICS.os === 'ios' || OSSPECIFICS.os === 'android')) attributes['onPress'] = () => updateUrl(url);
    
    //If the structure is an array with missing 'key' property, then destructure the input; The structure array with n objects, becomes n arguments in the function
    if(Array.isArray(structure) && structure?.length > 0 && structure?.[0]?.key == null) return React.createElement(ComponentFunctionOrTag, attributes, ...structure)
    return React.createElement(ComponentFunctionOrTag, attributes, structure); 
}

//=============================================================================
// APP: A function that ties together the functionality of all the other modules.
// By providing the configuration objects to the app() function, the state, theme
// databases and texts are setup and the app is rendered.//
//=============================================================================

/**
* @typedef  {Object}  Text - The configuration to setup and translate all the texts inside the app.
* @property {String}  textId               - The id identifying the content of the text. E.g: 'homepageTitle'.
* @property {String}  textId.language      - The language for the text string.
*/
/** 
* @description Main function to set up the app and render the template in the DOM. All the configuration required to run the app is provided to this function.
* @param {String} [name] - Unique name for the app. Used to set up indexedDB storage.
* @param {Config} [state] - The configuration object to setup the state. Declares all the state variables along with the source and storage option.
* @param {Theme} [theme] - The collection of flavors that will be used to style the app. Defines the theme variables and the values that will be used for each flavor.
* It can also be a string to choose from the out-of-the-box themes provided by oneJS.
* @param {Text} [text] - The translatable text strings to be used in the app. 
* @param {Object} - The initialized firestore dabase object to enable performing the read/write operations.
* @param {Function} template - A function that returns the template of the app.
* @example
* Simple Hello World example:
* ```javascript 
* app({template: ()=>"Hello World"});
* ```
* @example
* Complete Example:
* ```javascript 
*   const name = 'myApp';
*   const template = () => [Text()(readText('title')), Text()(readText('greeting') + ': ' + read('inputText')), Input({value: read('inputText', onInput: update('inputText'))})];
*   const state = {inputText: {default: 'myApp'}}
*   const theme = {default: {primaryColor: 'blue'}};
*   const text = {title: 'My App',  greeting: {en: 'Hello', es: 'Hola'}};
*   const firestore = initializeApp(config).getFirestore();
*   app({name: name, template: template, state: state, theme: theme, themeSetup: themeSetup, text: text, firestore: firestore})
* ```
* @returns {ReactElement} - The complete app component.
*/
export const AppComponent = ({name, state, theme, style, text, firestore}) => template => {
    ONEJS.appName = name;
    ONEJS.appText = text;
    ONEJS.style = style;
    ONEJS.firestore = firestore;
    setupTheme({theme: theme}); //Setting up before AppComponent for the css class order.

    //*REACT SPECIFIC*
    const appFunction =  ({state={}, template}={}) => {//Called on every rerender
        //Setup url variables
        if(OSSPECIFICS.os === 'ios' || OSSPECIFICS.os === 'android') [ONEJS.reactUrl, ONEJS.reactSetUrl] = React.useState('/');

        //Set default value for state variables
        Object.entries(state).forEach(([stateId, value]) => {
            const reactInitialState = (value && typeof value === 'object' && value.hasOwnProperty('default')) ? value['default'] : value;
            [ONEJS.reactState[stateId], ONEJS.reactSetState[stateId]] = React.useState(reactInitialState);
            /* React.useState(initialState): Returns an array with a stateful value, and a function to update it. [state, setState()]
                -initialState: During the initial render, the returned state (state) is the same as the value passed as the first argument (initialState).
                -setState(): The setState function is used to update the state. It accepts a new state value and enqueues a re-render of the component.
            */    
        });

        const initialized = React.useRef();
        //Setup url listener for native
        if(OSSPECIFICS.os === 'ios' || OSSPECIFICS.os === 'android') {
            React.useEffect(() => {
                if(initialized) ONEJS.urlStateVariables.forEach(stateVariable => write(stateVariable.stateId, readUrlData(stateVariable.url), 'url', 'update'));
            }, [ONEJS.reactUrl]);
        }

        //Sets up the state for the app for the first time
        if(!initialized.current) {
            setupState(state);
            //Setup url listeners for web
            if(OSSPECIFICS.os === 'web') {
                window.addEventListener('urlChange',  (e) => { 
                    ONEJS.urlStateVariables.forEach(stateVariable => write(stateVariable.stateId, readUrlData(stateVariable.url), 'url', 'update'));
                }, false);
            }
            initialized.current = true;
        }
        
        if(!ONEJS.appTemplate) ONEJS.appTemplate = template();
        const structure = template(); //Template needs to be a function, otherwise the code is executed and the elements are not wrapped by reactCreateElement function
        if(Array.isArray(structure) && structure?.length > 0 && structure?.[0]?.key == null) {
            return React.createElement(React.Fragment, null, ...structure);//If the structure is an array with missing 'key' property, then destructure the input
        };
        return structure;    
    }

    if(OSSPECIFICS.os === 'web') {
        const bodyStyle = {
            margin: 0,
            minHeight: '100vh',
            display: 'flex',               //Flexbox is the positioning being used
            flexWrap: 'wrap',              //Items to fall into a different row once exhausted the space on the parent
            flexGrow: '0',                 //It indicates how much they expand horizontally. A value of 0 indicates they do not expand
            flexShrink: '0',               //A value of 0 indicates items do not go smaller than their original width
            flexDirection: 'column',       //Row or column
            justifyContent: 'flex-start',  //Horizontal alignment of the items
            alignItems: 'stretch',         //Vertical alignment of the items
            alignContent: 'stretch',       //Vertical alignment of the items
        }
        document.body.classList.add(OSSPECIFICS.css(bodyStyle));
    }
    

    const AppComponent = React.createElement(appFunction, {state: state, template: template},null);
    return AppComponent;
}

//=============================================================================
// WEB THEME: This module aims to provide a unified and predictable way to define
// and inherit styles for components and setup a consistent look and feel for the
// app.
// The principle behind is that everything that can change or be open for customization 
// by the user, should be a theme variable (in web they are converted into CSS variables). 
// Theme variables are given representative names and clustered under 'flavors' which 
// are essentially a specific set of values for those variables. By providing a
// flavor to components, the look and feel can be customized for the theme variables
// the component is implementing.
//
// STEPS to setup app theme on Web:
// 1. Define a theme object containing the different flavors. Always include a
//    'default' flavor. Example:
//    const myTheme: {default: {primaryColor: 'blue'}, error: {primaryColor: 'red'}};
// 2. Define a setup object assigning the theme variables to the target dom elements.
//    const myThemeSetup = {p: {color: readFlavor('default').primaryColor}};
// 3. Initialize the app with these two objects and use the theme variables inside
//    your custom components to inherit the look and feel.   
//    app({template: template, theme:myTheme, themeSetup: myThemeSetup});
//    Text({flavor: 'error'})('My Text'); //Use flavor
//
// Native Principles:
//  React components are designed with strong isolation in mind: This is possible to 
//  drop a component anywhere in the application, trusting that as long as the props 
//  are the same, it will look and behave the same way. Text properties that could inherit
//  from outside of the props would break this isolation. https://reactnative.dev/docs/0.65/text
// 
//  Differences from Web
// 1. It is a CSS-like object structure but not CSS, and not compiled to CSS.
// 2. Style structure is flat and properties are limited. Therefore no styling 
//    attributes such as ':hover'. https://reactnative.dev/docs/text-style-props
// 3. Each style must be applied to each component, they are not inherited from their 
//    parent. There is only inheritance from parents of the same element (E.g.: Text to 
//    Text) https://reactnative.dev/docs/text#limited-style-inheritance
// 4. There are no global attributes (body level) and no tag styling 
//    Example: style: {Text: {color: 'blue'}} //This is not possible.
//
// STEPS to setup app theme on Native:
// 1. Define a theme object containing the different flavors. Always include a
//    'default' flavor. Example:
//    const myTheme: {default: {textColor: 'blue'}, error: {textColor: 'red'}};
// 2. Define a components to make use of the theme variables so the user can customize
//    them on instantiation. setup object assigning the theme variables to the target dom elements.
//    export const Text = ({flavor=readFlavor('default'), ...attributes}={}) => structure => { 
//          const flavorStyle = {flavor?.textColor ?? 'black', fontSize: flavor?.textSize ?? 16};
//          attributes['style'] = mergeStyles(flavorStyle, attributes['style']);
//          return RNText(attributes)(structure);      
//    }
// 3. Initialize the app providing the theme object and use the theme variables inside
//    your custom component instantiation to customize the look and feel attributes
//    exposed in the declaration.   
//    app({template: template, theme:myTheme});
//    Text({flavor: 'error'})('My Text'); //Use flavor
//
// Other approaches to define global and reusable theming:
// 1. Create a theme object with all the variables and the values to be used (chosen one)
//    https://www.reactnative.guide/8-styling/8.1-theme-variables.html
// 2. Wrap existing components in a new one that provides them the desired theme  
//    https://stackoverflow.com/questions/35255645/how-to-set-default-font-family-in-react-native
// 3. Use context API to scope and update theme globally.
//    https://medium.com/@matanbobi/react-defaultprops-is-dying-whos-the-contender-443c19d9e7f1
//
//=============================================================================

/** 
* @description There are a few theme variables that in order to be applied to the style properties need to be transformed. This is due to the format allowed in 
* oneJS differing from CSS or native. This function compiles the theme variables to the underlying standard style (CSS or native). 
* @param {String} themeVariableId - The theme variable id.
* @param {*} themeVariableValue - The variable value.
* @example
* ```javascript 
*   const myFlavor: {radius: 3, primaryGradient: {colors: ['red', 'blue']}};
*   toStandardStyle('radius', myFlavor.radius);                   //Web output: '3px'
*   toStandardStyle('primaryGradient', myFlavor.primaryGradient); //Web output: 'linear-gradient(-90, red, blue)'
* ```
* @returns {Object} - The css variables with their corresponding values.
*/
const toStandardStyle = (themeVariableId, themeVariableValue) => {
    /* Problably released as a future feature if it generates interest
    //Consolidate borders: on web they can be defined in a single 'border' propeperty while on native
    if(themeVariableId === 'border' || themeVariableId === 'inputBorder' && typeof themeVariableValue === 'object') {
        if(OSSPECIFICS.os === 'web') return toPx(themeVariableValue.width) ?? '0px' + ' ' +  themeVariableValue.style ?? 'solid'  + ' ' +  themeVariableValue.color ?? 'tranparent';
        else return {width: themeVariableValue.width, style: themeVariableValue.style, color: themeVariableValue.color};        
    } */
    //Allow using number units in web for radius property as in RN
    if(themeVariableId === 'radius' && OSSPECIFICS.os === 'web' && (typeof themeVariableValue === 'number')) return toPx(themeVariableValue);
    //Allow using number units in web for borderWidth property as in RN
    if((themeVariableId === 'borderWidth' || themeVariableId === 'inputBorderWidth') && OSSPECIFICS.os === 'web' && (typeof themeVariableValue === 'number')) return toPx(themeVariableValue);
    //Create shadow style object based on elevation property
    if(themeVariableId === 'shadow' && typeof themeVariableValue === 'object') return generateShadow(themeVariableValue);
    //Create gradient for texts
    if(themeVariableId === 'textGradient' && typeof themeVariableValue === 'object') return generateGradient(themeVariableValue);
    //Create gradient for backgrounds
    if(themeVariableId === 'backgroundGradient' && typeof themeVariableValue === 'object') return generateGradient(themeVariableValue);
    //Create gradient for backgrounds and icons
    if(themeVariableId === 'primaryGradient' && typeof themeVariableValue === 'object') {
        const svgId = JSON.stringify(themeVariableValue).replace(/[^a-zA-Z0-9]/g, '');
        let standardGradient = generateGradient(themeVariableValue);
        standardGradient = typeof standardGradient === 'string' ? standardGradient : {id: svgId, ...standardGradient};
        const svgGradient = generateGradient({...themeVariableValue, svgId: svgId});
        ONEJS.iconGradients.set(svgId, {id: svgId, value: svgGradient});
        return standardGradient;
    }
    else return themeVariableValue;
}

/** 
* @description The web uses pixels as the main unit while React Native favors density independent pixels. Style properties that involve measurements are specified
* with unitless 'number' typed variables on RN. Web on the other hand requires strings spcifying the unit. This function aims to bridge that gap and convert 
* unitless values on the web to pixels by default.
* @param {String | Number} measure - The style property associated to a meassurement that needs to be converted.
* @example
* ```javascript 
*   const myFlavor: {radius: 3};
*   toPx(myFlavor.radius); //Returns '3px'
* ```
* @returns {Any} - The converted.
*/
const toPx = (measure) => {
    return (typeof measure === 'number') ? measure + 'px' : measure;
}

/**
* @typedef  {Object}  Flavor          - The configuration assigning a value to each of the theme variables.
* @property {String}  themeVariableId - Assigns to the theme variable 'themeVariableId' the corresponding value.
* @example
*   const myFlavor: {primaryColor: 'blue', radius: '3px', shadow: null};
*/
/** 
* @description Returns the style configuration associated to the flavor(s) selected.
* @param {String | Array<String>} flavorName - The name of the flavor(s) to be used from the theme.
* @example
* ```javascript 
*   const theme: {myFlavor: {primaryColor: 'blue', radius: '3px', shadow: null}};
*   readFlavor('myFlavor'); //Return {primaryColor: 'blue', radius: '3px', shadow: null}
* ```
* @returns {Flavor} - The flavor selected.
*/
export const readFlavor = (...flavorName) => {
    if(!flavorName || flavorName?.length === 0) {console.error('readFlavor: Invalid flavor name: '+ flavor);return {};} 
    if(Array.isArray(flavorName[0])) flavorName = flavorName[0]; //This way we allow three input options: String, Array and destructured
    if(flavorName.length > 1) {//Flavor is an array of strings: Increasing priority from left to right
        let flavorObject = {};//Used inside EnhancedComponent to read the flavor CSS and add a class with the variable values.
        flavorName.forEach((flavor) => {flavorObject = flavor ? {...flavorObject, ...ONEJS.theme[flavor]} : flavorObject});
        return {...ONEJS.theme['default'], ...flavorObject};
    }
    return ONEJS.theme[flavorName[0]] ? {...ONEJS.theme['default'], ...ONEJS.theme[flavorName[0]]} : ONEJS.theme['default'];
}
/** 
* @description Updates the value of entire flavor or the theme variable within the flavor .
* @param {String} flavorName - The name of the flavor to be updated.
* @param {String} [themeVariableId] - The theme variable to be updated within the flavor.
* @param {String} value - The value to be assigned to the flavor or theme variable.
* @example
* ```javascript 
*   const theme: {myFlavor: {primaryColor: 'blue', radius: '3px', shadow: null}};
*   updateFlavor('myFlavor', 'primaryColor')('red'); 
*   updateFlavor('myFlavor')({primaryColor: 'red', radius: '0px', shadow: null}); 
* ```
*/
export const updateFlavor = (flavorName, themeVariableId) => value => {
    if(!ONEJS.style?.flavorName) {console.error('[oneJS] updateFlavor: Invalid flavor name: ' + flavorName); return}
    if(typeof themeVariableId === 'string') ONEJS.theme.flavorName.themeVariableId = value;
    ONEJS.theme.flavorName = value;
}

/** 
* @description Returns the style configuration associated to the style(s) selected.
* @param {String | Array<String>} styleName - The name of the style(s) to be used.
* @example
* ```javascript 
*   const style: {navbar: {background: 'white', borderRadius: '3px', color: 'black'}};
*   readStyle('navbar'); //Return {primaryColor: 'blue', radius: '3px', shadow: null}
* ```
* @returns {Object} - The resulting style of merging the different styles.
*/
export const readStyle = (...styleName) => {
    if(!styleName || styleName?.length === 0) {console.error('[oneJS] readFlavor: Invalid flavor name: '+ flavor);return {};} 
    if(Array.isArray(styleName[0])) styleName = styleName[0]; //This way we allow three input options: String, Array and destructured (combining destructured and array is not possible)
    if(styleName.length > 1) {//Flavor is an array of strings: Increasing priority from left to right
        let styleArray = [];//Used inside EnhancedComponent to read the flavor CSS and add a class with the variable values.
        styleName.forEach((name, index) => styleArray[index] = ONEJS.style[name]);
        return mergeStyles(styleArray);
    }
    return ONEJS.style[styleName[0]];
}
/** 
* @description Updates the value of entire style or an attribute within the style .
* @param {String} styleName - The name of the style to be updated.
* @param {String} [attributeId] - The attribute to be updated within the style.
* @param {String} value - The value to be assigned to the style or the style attribute.
* @example
* ```javascript 
*   const style: {navbar: {background: 'white', borderRadius: '3px', color: 'black'}};
*   updateStyle('navbar', 'background')('red'); 
*   updateStyle('navbar')({background: 'red', borderRadius: '0px', color: 'black'}); 
* ```
*/
export const updateStyle = (styleName, attributeId) => value => {
    if(!ONEJS.style?.styleName) {console.error('[oneJS] updateStyle: Invalid style name: ' + styleName); return}
    if(typeof attributeId === 'string') ONEJS.style.styleName.attributeId = value;
    ONEJS.style.styleName = value;
}

/** 
* @description Using the theme and themeSetup configuration objects creates the css classes and applies then to the DOM objects. 
* The default falvor values are set at body level.
* @param {Theme | String} theme - If it is a string, the oneJS theme to be used. If a theme object, the collection of flavors with the theme variables.
* @param {Object} themeSetup - The CSS in JS object applying the theme variables to the DOM objects.
* @param {Object} themeCollection - The collection of preset themes provided.
* @example
* ```javascript 
*   const theme = {default: {primaryColor: 'blue'}};
*   const themeSetup = {p: {color: themeVariable('primaryColor')}};
*   setupTheme({theme: theme, themeSetup: themeSetup});
* ```
*/
const setupTheme = ({theme, themeCollection=oneTheme}={}) => {
    /*There are three options: 
        theme = null/undefined -> No theme is used
        theme = <string value> -> User wants to select one of the collection of themes from the theme collection
        theme = <object value> -> User wants to setup their own themes based on the relevant parameters
    */
    if(!theme) return; //No theme is used
    else if(typeof theme === 'string') {
        if(themeCollection[theme]) theme = themeCollection[theme]; //Selects a certain theme from the collection
        else console.error('setupTheme: Invalid theme: ' + theme);
    }

    //Setup the ONEJS.theme object
    Object.entries(theme).forEach(([flavorId, flavorValue]) => { //Transform each of the themes in css variables stored in a class. This can now be applied to any component
        ONEJS.theme[flavorId] = {flavorId: flavorId};
        Object.entries(flavorValue).forEach(([key, value]) => { 
                ONEJS.theme[flavorId][key] = value === null ? null : toStandardStyle(key, value);
        });
    });
}

/** 
* @description Reads the SVG icon gradient that has been stored in the ONEJS.iconGradients variable. For web, icon gradients are stored by 'setupTheme' function
* already transformed to SVG gradient. For native, icon gradients are generated and stored on the first call to this function, transforming the input gradient
* object into the SVG gradient and storing it in the ONEJS.iconGradients variable.
* @param {String} gradientId - For web, this is the string representing the CSS gradient variable. For native, it is the gradient object.
* @example
* ```javascript 
*   //Web
*   const gradientId = 'var(--one-primaryGradient, linear-gradient(0deg, red, blue))';
* 
*   //Native
*   const gradientId = {angle: 0, colors: ['red', 'blue']};
* 
*   //Output for Web and Native: readIconGradient(gradientId)
*   <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
*      <stop offset="0%" stop-color="red" />
*      <stop offset="100%" stop-color="blue"/>
*   </linearGradient>
* ```
* @returns {String} - The stored SVG gradient.
*/
export const readIconGradient = gradientId => {
    return ONEJS?.iconGradients?.get(typeof gradientId === 'string' ? gradientId : gradientId?.id);
}

/** 
* @description Given a set of parameters generates a gradient for both web, native and SVG icons.
* Web Gradient: Follows the linear-gradient CSS specifications. [W3 Schools]{@link https://www.w3schools.com/css/css3_gradients.asp}
*   Syntax: linear-gradient(angle, color-stop1, color-stop2, ...);
* Native Gradient: Follows the expo LinearGradient component specification. [Expo]{@link https://docs.expo.dev/versions/latest/sdk/linear-gradient/}
*   Component Properties: colors, start, end, locations
* SVG Gradient: Follows the SVG Linear Gradient specificication. [W3 Schools]{@link https://www.w3schools.com/graphics/svg_grad_linear.asp}
*   Syntax: The syntax is similar to expo Linear Gradient, where the direction is specified by coordinates and the location by the offset.
* ```svg
*   <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
*      <stop offset="0%" stop-color="red" />
*      <stop offset="100%" stop-color="blue"/>
*   </linearGradient>
* ```
* @param {Array<String>} colors - The array of colors to generate the gradient.
* @param {Number} [angle] - Angle in degrees. Follows the unit circle angular convention ([Wikipedia]{@link https://en.wikipedia.org/wiki/Unit_circle}). The direction
* of the gradient is derived * solely by the angle, represented by the vector whose origin is the center of the circle and the heap  on the perimeter. 
* An angle of 0deg would correspond * to a left to right gradient while an angle of 90deg would correspond to bottom to top gradient.
* @param {Array<Number>} [start] - In a squared space where the coordinates' origin is located in the top left corner and x and y are the horizontal and vertical axis 
* respectively, start is the pair of x and y coordinates that locate the origin of the gradient direction vector. [0, 0] would correspond to the origin (top-left corner)
* and [1, 1] would correspond to the bottom-bottom right corner.
* @param {Number} [end] - Following the same spacial convention, it is the pair of x and y coordinates that locate the heap of the gradient direction vector.
* @param {Array<Number>} [locations] - From 0 to 1, it represents how the colors are split across the direction vertor formed by the angle or the start and 
* end coordinates. 0 would correspond to the origin and 1 to the heap. The number of locations has to match the number of colors. If it is not provided, the colors
* are evenly split.
* @param {Boolean} [svgId] - If provided, the function will create an SVG gradient with this id. Used for both web and native.
* @example
* ```javascript 
*   const theme = {default: {primaryColor: 'blue'}};
*   const themeSetup = {p: {color: themeVariable('primaryColor')}};
*   setupTheme({theme: theme, themeSetup: themeSetup});
* ```
* @returns {String | Object} - Generated gradient in string or object format, depending on the platform.
*/
export const generateGradient = ({colors, angle=0, start, end, locations, svgId}) => {
    if(!colors || !Array.isArray(colors) || colors.length < 2) {console.error('generateGradient: "colors" array must contain at least two items');return}
    if(!locations) locations = colors.map((color, index) => (index / (colors.length - 1)).toFixed(2));
    else if(locations && locations.length !== colors.length) {console.error('generateGradient: "colors" and "locations" arrays must be the same length.');return}
    
    //CSS linear-gradient
    if(OSSPECIFICS.os === 'web' && !svgId) return 'linear-gradient(' + (90 - angle) + 'deg, ' + colors.join(', ') + ')';//Following the unit circle where the first color is in the origin and the rest in the direction of the angle
    
    //For native and SVG, transforms the angle into the start and end pair of [x,y] coordintates.
    if(start == null || end == null) {
        const a = angle * Math.PI / 180;//Input angle is in degrees need to convert to radians
        const k = Math.ceil(Math.sin(45 * Math.PI / 180) * 10000) / 10000;//Sin(45) = cos(45). Rounding up to avoid obtaining x and y greater than 1.
        start = {x: Math.cos(a) > 0 ? 0 : 1, y: Math.sin(a) > 0 ? 1 : 0};
        end = {
            x: Math.abs(Math.cos(a)) < k ? +Math.abs(start.x - Math.abs(Math.cos(a))/k).toFixed(2) : Math.abs(start.x - 1),
            y: Math.abs(Math.sin(a)) < k ? +Math.abs(start.y - Math.abs(Math.sin(a))/k).toFixed(2) : Math.abs(start.y - 1)
        };
        //Reposition start and end, so that the vector that goes from start to end crosses the center of the square
        if(start.x + end.x !== 1) {const dif = start.x - end.x; start.x = 0.5 + dif / 2; end.x = 0.5 - dif / 2}; //Reposition to the center
        if(start.y + end.y !== 1) {const dif = start.y - end.y; start.y = 0.5 + dif / 2; end.y = 0.5 - dif / 2}; //Reposition to the center
    }

    //SVG Gradient
    if(svgId) return '<defs><linearGradient id="' + svgId + '" x1="' + start.x + '" y1="' + start.y + '" x2="' + end.x + '" y2="' + end.y + '">' + 
            locations.map((location, index) => '<stop offset="' + location + '" stop-color="' + colors[index] + '"></stop>').join('') + '</linearGradient></defs>';
    //Expo LinearGradient
    return {colors: colors, locations: locations, start: start, end: end};    
}

/** 
* @description Generates a shadow that looks consistent across web and native given the component's elevation.
* @param {Number} elevation - A number that represents the component's elevation with respect to its parent. 
* The minimum elevation is 0 (no shadow) and the maximum is 24 (greatest shadow).
* @example
* ```javascript 
*   const theme = {dark: {primaryColor: '#ffffff', backgroundColor: '#333333', shadow: generateShadow(4)}};
* ```
* @returns {String | Obect} - For web, returns the box-shadow CSS string. For Android, the elevation object. For iOS, the object with the shadow properties.
*/
export const generateShadow = ({elevation}) => {//min elevation 0, max elevation 24. Remove os as input and use internally
    if(!elevation) return {}; //If elevation is 0 or null/undefined
    if(typeof elevation !== 'number') {console.error('generateShadow: elevation must be a number.'); return {};}

    if(OSSPECIFICS.os === 'android') return {elevation: elevation};
    else if (OSSPECIFICS.os === 'ios') return {
        shadowColor: 'black',
        shadowOffset: {
            width: 0,
            height: elevation / 2,
        },
        shadowOpacity: 0.01739 * elevation + 0.1626,//[1-24] => [0.18, 0.58]
        shadowRadius: 0.6956 * elevation + 0.3043,//[1-24] => [1, 16]
    }
    //CSS box-shadow: horizontal offset, vertical offset, blur, spread, color
    else if(OSSPECIFICS.os === 'web') return {boxShadow: '0 ' + elevation / 2 + 'px ' + elevation + 'px ' + elevation / 2 + 'px rgba(0, 0, 0, 0.1)'};
    return {};
}

/** 
* @description The styles to be merged are input separated by a comma and they are combined applying left to right increasing priority. This is specially
* useful when creating a custom Component and providing a set of internal styles but enabling the user as well to use their own style at instantiation.
* @param {Object | Array<Object>} style - The list of styles to be merged. 
* @example
* ```javascript 
*   //Object merge
*   const style1 = {primaryColor: 'blue', backgroundColor: 'white', radius: '1px'};
*   const style2 = {primaryColor: 'red', border: '1px solid green'};
*   mergeStyles(style1, style2); //Output: {primaryColor: 'red', backgroundColor: 'white', radius: '1px', border: '1px solid green'}
* 
*   //Array merge
*   const styleArray = [{primaryColor: 'blue', backgroundColor: 'white', radius: '1px'}, {primaryColor: 'red', border: '1px solid green'}];
*   mergeStyles(styleArray); //Output: {primaryColor: 'red', backgroundColor: 'white', radius: '1px', border: '1px solid green'}
* ```
* @returns {Object} - The result of merging the input styles.
*/
export const mergeStyles = (...styles) => {
    let finalStyle = {};
    styles?.forEach((style) => {
        if(Array.isArray(style)) style.forEach(styleObj => {if(styleObj && typeof styleObj === 'object') finalStyle = {...finalStyle, ...styleObj};});
        else if(style && typeof style === 'object') finalStyle = {...finalStyle, ...style};
    });
    return finalStyle;
}

/**
* @typedef  {Object}  Content     - The configuration specifying the positioning of the component's content. It is used in the View component only.
* @property {String}  [direction] - The direction in which children are positioned with respect to the component.
*   row:            Default value. Places children components in a row from left to right.
*   row-reverse:    Places children components in a row from right to left.
*   column:         Places children components in a column from top to bottom.
*   column-reverse: Places children components in a column from bottom to top.
* @property {String}  [h]         - The horizontal distribution and positioning of the children. When the content is positioned in columns and it overflows spanning
*                                   several columns, it is also used to set how these columns are distributed (as if they were single horizontal blocks).
*   left:           Default value. Places children components aligned to the left.
*   right:          Places children components aligned to the right.
*   center:         Places children components aligned to the center.
*   distribute:     Distributes children equidistantially with respect to each other and the edges of the parent.
*   space:          Distributes children so that they are as spaced from each other as possible and pushes them towards the parent's edges.
*   stretch:        Streches children components across the transversal (horizontal direction) to fill the component. Similar to expand, but expand is set on the
*                   each of the children and works in the content direction. 
* @property {String}  [v]         - The vertical distribution and positioning of the children. When the content is positioned in rows and it overflows spanning
*                                   several rows, it is also used to set how these rows are distributed (as if they were single vertical blocks).
*   top:            Default value. Places children components aligned to the top.
*   bottom:         Places children components aligned to the bottom.
*   center:         Places children components aligned to the center.
*   distribute:     Distributes children equidistantially with respect to each other and the edges of the parent.
*   space:          Distributes children so that they are as spaced from each other as possible and pushes them towards the parent's edges.
*   stretch:        Streches children components across the transversal (vertical direction) to fill the component. Similar to expand, but expand is set on the
*                   each of the children and works in the content direction. 
* @property {Boolean} [wrap]      - Specifies whether children components are allowed to overflow into extra rows/columns once the space in the first row/column is
*                                   exhausted. True by default.
* @example
* ```javascript 
*   const content: {direction: 'column', h: 'center', v: 'top', wrap: false};
*   View({style: view1Style, content: content, key: 'view1'})(Text()('Hello World!'));
* ```
*/
/** 
* @description Generates the Flexbox CSS properties to be applied to the View component, given the Content custom object configuration. 
* Reference: [W3 Schools]{@link https://www.w3schools.com/css/css3_flexbox.asp}
* @param {Content} content - The The configuration specifying the positioning of the component's children.
* @example
* ```javascript 
*   const content: {direction: 'column', h: 'center', v: 'top', wrap: false};
*   View({style: view1Style, content: content, key: 'view1'})(Text()('Hello World!'));
* ```
* @returns {Object} - The CSS properties for the Flexbox.
* @todo Create a 'positons' object, similar to 'animations', with a set of predefined positions to choose from (rather than parsing the text).
* @todo add gap variable
*/
export const positionContent = (content) => {
    let direction = 'row';          //Direction of the content. Row: Content flows along the x-axis (horizontal). Column: Content flows along the y-axis (vertical).
    let wrap = 'wrap';              //Wraps the content adding new lines if it exceeds the space in the longitudinal direction.
    let longitudinal = 'flex-start';//Positioning in the content direction
    let transversal = 'flex-start'; //Positioning in the cross direction, perpendicular to the content
    let overflow = 'flex-start';    //Positioning of the different rows and columns of content that overflow how are they aligned to each other.
    let gap = undefined;                    //Gap between content items
    if(content) {
        wrap = (content.wrap ?? true) ? 'wrap' : 'nowrap';
        direction = content.direction ?? 'row';
        gap = content.gap ?? undefined;
        longitudinal = direction === 'row' ? content.h ?? 'left' : content.v ?? 'top';  //In the content direction
        transversal  = direction === 'row' ? content.v ?? 'top'  : content.h ?? 'left'; //Transversal to the content direction

        //Options for longitudinal alignment in CSS (justify-content): flex-start | flex-end | center | space-between | space-around | space-evenly | start | end | left | right
        //Options for longitudinal alignment in oneJS: left, center, right (for rows). top, center, bottom (for cols). space, distribute (for both)
        if(longitudinal === 'center') longitudinal = longitudinal;
        else if(longitudinal === 'bottom' || longitudinal === 'right') longitudinal = 'flex-end';
        else if(longitudinal === 'distribute') longitudinal = 'space-around';
        else if(longitudinal === 'space') longitudinal = 'space-between';
        else longitudinal = 'flex-start';       

        //Options for transversal alignemnt in CSS (align-items): stretch | flex-start | flex-end | center | baseline | first baseline | last baseline | start | end | self-start | self-end
        //Options for transversal alignment in oneJS: left, center, right (for cols). top, center, bottom (for rows). stretch?
        //Options for transversal alignment of the contet overflow in CSS (align-content): flex-start | flex-end | center | space-between | space-around | space-evenly | stretch | start | end | baseline | first baseline | last baseline
        //These options are also used to align the content overflow:
        if(transversal === 'center') {transversal = transversal; overflow = 'center';}
        else if(transversal === 'bottom' || transversal === 'right') {transversal = 'flex-end'; overflow = 'flex-end';}
        else if(transversal === 'distribute') {transversal = 'center'; overflow = 'space-around';}
        else if(transversal === 'space') {transversal = 'center'; overflow = 'space-between';}
        else if(transversal === 'stretch') {transversal = 'stretch'; overflow = 'stretch';} //Stretch: If the transversal dimension is not known, stretches the element. To be able to stretch the element 'align-content' also needs to be set to stretch.
        else {transversal = 'flex-start'; overflow = 'flex-start';}           
    }
    return {flexDirection: direction, justifyContent: longitudinal, alignItems: transversal, alignContent: overflow, flexWrap: wrap, gap: gap}; 
}

/**
* @typedef  {Theme}   Theme                    - A collection of flavors, assigning a value to each of the theme variables.
* @property {Object}  default                  - The default flavor to be applied if none are specified. It is required for every theme.
* @property {String}  default.themeVariable    - For the default flavor, assigns to the theme variable 'themeVariableId' the corresponding value.
* @property {Object}  [flavorId]               - The configuration assigning a value to each of the theme variables.
* @property {String}  [flavorId.themeVariable] - Assigns to the theme variable 'themeVariableId' the corresponding value.
* @example
*   const myTheme: {default: {primaryColor: 'blue'}, success: {primaryColor: 'green'}, error: {primaryColor: 'red'}};
*/
/**
* @description The object containing the preset bundle of themes. These define a set of theme variables and their values for each flavor.
*   -Root Level (Theme): Defines themes (flavor collection). This is only used by one to provide multiple themes, users must skip this level.
*   -Level 1 (Flavor): Defines flavors. "default" flavor always has to be provided. E.g: warning, success, default
*   -Level 2 (Variable): Assigns to the theme variable a value. E.g: primaryColor: 'blue'.
* 
* Note: The main advantage of using theme variables contained in flavors over CSS classes, is that is allows to theme the app using language agnostic 
* styling terms rather than CSS or React Native specific attributes. These values can also be reused inside components to define the style object. In the case of
* Web, the implementation uses CSS variables which improve performance and allow the user to swiftly change theme variables.
* 
* These are the theme variables suggested by oneJS to customize the look and feel of the app:
*   - backgroundColor:      Color to be applied in the background of container components, such as a View or a Button.
*   - primaryColor:         Primary color of the app, used to style Icons and Buttons. Tip: rather than creating a 'secondaryColor' theme variable create 
*                           another flavor named 'secondary' storing this value in 'primaryColor'. If secondary color is used heavily and in combination with the
*                           primary color in components, then it may be needed to add 'secondaryColor' theme variable.
*   - neutralColor:         Neutral color that can be used in combination with the primary color.
*   - primaryGradient:      Defines a gradient that can be used to style buttons and icons.
*   - textGradient:         Defines a gradient that can be used to style texts.
*   - backgroundGradient:   Defines a gradient that can be used to style backgrounds of Views.
* 
*   - textFont:             Font family for the text strings.
*   - textColor:            Text color.
*   - textSize:             Font size. Preferrably defined in % values.
* 
*   - radius:               Border radius for container components.
*   - borderWidth:          Border width for container components.
*   - borderStyle:          Border style for container components.
*   - borderColor:          Border color for container components.
*   - inputBorderWidth:     Border width for input components.
*   - inputBorderStyle:     Border style for input components.
*   - inputBorderColor:     Border color for input components.
* 
*   - shadow:               Backdrop shadow. It is generated by specifying the elevation of the component (from 0, closest to 24, furthest).
* @type {Object}
*/
export const oneTheme = {
    oneJS: { //Theme name
        default: { //Flavor name
            //The idea is to have as few parameters as possible so that all components use these paremeters and you are able to customize them with your own flavor.
            //E.g. your texts and your inputs use 'textFont, then you are able to create a 'input' flavor to customize only inputs.
            // primaryColor: '#0077ff', //primary
            //Color
            backgroundColor: '#ffffff',//contrast
            // neutralColor: '#D9DADC',//#D9DADC #9ba8a7
            primaryColor: '#094DFF',
            neutralColor: '#b1b0c5',//#D9DADC #9ba8a7
            acceptColor:  '#60b33a',
            rejectColor: '#ff5100',

            //Text
            textFont: '"AvenirNextLTPro-Regular", Arial, sans-serif',
            // textColor: '#666',
            textColor: '#666488',
            textSize: '100%',
            textWeight: 'normal',

            //Border
            //Note: 'borderStyle' by default on native is solid and in web is none
            radius: 10,
            // border: {width: 0, style: 'none', color: 'transparent'}, 
            borderWidth: 0,
            borderStyle: 'none',
            borderColor: 'transparent',

            // iconSize: 32,
            //potentially remove
            inputBorderWidth: 1,
            inputBorderStyle: 'solid',
            inputBorderColor: '#D9DADC',

            //Shadow
            shadow: {elevation: 0},
        },
        title: {
            // textColor: '#333',
            textColor: '#4c4b66',
            textSize: '250%',
        },
        subtitle: {
            // textColor: '#666',
            textColor: '#666488',
            textSize: '175%',
        },
        header: {
            // textColor: '#666',
            textColor: '#666488',
            textSize: '120%',
        },
        primaryGradient: {
            primaryGradient: {colors: ['#0099ff', '#1100ff'], angle: 45},
            backgroundGradient: {colors: ['#0099ff', '#1100ff'], angle: 45},
            textGradient: {colors: ['#0099ff', '#1100ff'], angle: 45},
        },
        primaryGradientBackground: {
            backgroundGradient: {colors: ['#0099ff', '#1100ff'], angle: 45},
        },
        primary: {
            primaryColor: '#094DFF',
            textColor: '#094DFF'
        },
        primaryBackground: {
            backgroundColor: '#094DFF',
        },
        secondaryGradient: {
            primaryGradient: {colors: ['#5902b5', '#3704b8'], angle: 45},
            // backgroundGradient: {colors: ['#8a4fff', '#c252ff'], angle: 45}, //purple
            // backgroundGradient: {colors: ['#60b33a', '#40acbd'], angle: 45}, //green
            // backgroundGradient: {colors: ['#03fff7', '#03ffab'], angle: 45}, //neon green
            backgroundGradient: {colors: ['#666488', '#4c4b66'], angle: 45}, //dark gray
            // textGradient: {colors: ['#8a4fff', '#c252ff'], angle: 45}, //purple
            // textGradient: {colors: ['#9238ff', '#ff386d'], angle: 45}, //pink
            textGradient: {colors: ['#60b33a', '#40acbd'], angle: 45}, //green
        },
        sectionGradient: {
            primaryGradient: {colors: ['#5902b5', '#3704b8'], angle: 45},
            backgroundGradient: {colors: ['#ff386d', '#9238ff'], angle: 45},

            // backgroundGradient: {colors: ['white', '#ff386d', '#9238ff'], angle: 90},
            textGradient: {colors: ['#8a4fff', '#c252ff'], angle: 45}, //purple
            // textGradient: {colors: ['#9238ff', '#ff386d'], angle: 45}, //pink
            textGradient: {colors: ['#60b33a', '#40acbd'], angle: 45}, //green
        },
        // secondaryGradient: {//green
        //     primaryGradient: {colors: ['#60b33a', '#40acbd'], angle: 45},
        //     backgroundGradient: {colors: ['#60b33a', '#40acbd'], angle: 45},
        //     textGradient: {colors: ['#60b33a', '#40acbd'], angle: 45},
        // },
        ternaryGradient: {
            primaryGradient: {colors: ['#ff4400', '#ff7700'], angle: 45},
            backgroundGradient: {colors: ['#ff4400', '#ff7700'], angle: 45},
            textGradient: {colors: ['#ff4400', '#ff7700'], angle: 45},
        },
        silverGradient: {
            primaryGradient: {colors: ['#a6a5bd', '#bcbdcd'], angle: 45},
            backgroundGradient: {colors: ['#a6a5bd', '#bcbdcd'], angle: 45},
            textGradient: {colors: ['#a6a5bd', '#bcbdcd'], angle: 45},
        },
        goldGradient: {
            primaryGradient: {colors: ['#DBA514', '#B38728'], angle: 45},
            backgroundGradient: {colors: ['#DBA514', '#B38728'], angle: 45},
            // backgroundGradient: {colors: ['#BF953F', '#DBA514', '#B38728'], angle: 90},
            textGradient: {colors: ['#a6a5bd', '#bcbdcd'], angle: 45},
        },
        purpleGradient: {
            primaryGradient: {colors: ['#2600ff', '#d000ff'], angle: 45},
            textGradient: {colors: ['#2600ff', '#d000ff'], angle: 45},
        },
        pinkGradient: {
            primaryGradient: {colors: ['#e600ff', '#ff006f'], angle: 45},
            textGradient: {colors: ['#e600ff', '#ff006f'], angle: 45},
        },
        redGradient: {
            primaryGradient: {colors: ['#ff0059', '#ff5100'], angle: 45},
            textGradient: {colors: ['#ff0059', '#ff5100'], angle: 45},
        },
        orangeGradient: {
            primaryGradient: {colors: ['#ff6600', '#eeff00'], angle: 45},
            textGradient: {colors: ['#ff6600', '#eeff00'], angle: 45},
        },
        yellowGradient: {
            primaryGradient: {colors: ['#d9ff00', '#2fff00'], angle: 45},
            textGradient: {colors: ['#d9ff00', '#2fff00'], angle: 45},
        },
        greenGradient: {
            primaryGradient: {colors: ['#1aff00', '#00ff90'], angle: 45},
            textGradient: {colors: ['#1aff00', '#00ff90'], angle: 45},
        },
        blueGradient: {
            primaryGradient: {colors: ['#00ffa6', '#00aeff'], angle: 45},
            textGradient: {colors: ['#00ffa6', '#00aeff'], angle: 45},
        },
        purpleGradientBackground: {
            backgroundGradient: {colors: ['#2600ff', '#d000ff'], angle: 45},
        },
        pinkGradientBackground: {
            backgroundGradient: {colors: ['#e600ff', '#ff006f'], angle: 45},
        },
        redGradientBackground: {
            backgroundGradient: {colors: ['#ff0059', '#ff5100'], angle: 45},
        },
        orangeGradientBackground: {
            backgroundGradient: {colors: ['#ff6600', '#eeff00'], angle: 45},
        },
        yellowGradientBackground: {
            backgroundGradient: {colors: ['#d9ff00', '#2fff00'], angle: 45},
        },
        greenGradientBackground: {
            backgroundGradient: {colors: ['#1aff00', '#00ff90'], angle: 45},
        },
        blueGradientBackground: {
            backgroundGradient: {colors: ['#00ffa6', '#00aeff'], angle: 45},
        },
        neutral: {
            // primaryColor: '#D9DADC',
            // textColor: '#D9DADC'
            primaryColor: '#b1b0c5',
            textColor: '#b1b0c5'
        },
        neutralBackground: {
            // backgroundColor: '#D9DADC',
            backgroundColor: '#D9DADC',
        },
        gray: {
            // primaryColor: '#666',
            // textColor: '#666'
            primaryColor: '#666488',
            textColor: '#666488'
        },
        grayBackground: {
            // backgroundColor: '#666',
            backgroundColor: '#666488',
        },
        white: {
            // primaryColor: '#666',
            // textColor: '#666'
            primaryColor: '#fff',
            textColor: '#fff'
        },
        whiteBackground: {
            // backgroundColor: '#666',
            backgroundColor: '#fff',
        },
        dark: {
            // primaryColor: '#333',
            // textColor: '#333'
            primaryColor: '#4c4b66',
            textColor: '#4c4b66'
        },
        darkBackground: {
            // backgroundColor: '#333',
            backgroundColor: '#4c4b66',
        },
        darkGradient: {
            primaryGradient: {colors: ['#666488', '#4c4b66'], angle: 45},
            backgroundGradient: {colors: ['#666488', '#4c4b66'], angle: 45},
            textGradient: {colors: ['#666488', '#4c4b66'], angle: 45},
        },
        light: {
            // primaryColor: '#f1f1f1',
            // textColor: '#f1f1f1'
            primaryColor: '#e9e8ee',
            textColor: '#e9e8ee'
        },
        lightBackground: {
            // backgroundColor: '#f1f1f1',
            backgroundColor: '#e9e8ee',
        },
        danger: {
            primaryColor: '#ff0011',
            textColor: '#ff0011'
        },
        dangerBackground: {
            backgroundColor: '#ff0011',
        },
        disabled: {
            primaryColor: '#D9DADC',
            textColor: '#D9DADC'
        },
        disabledBackground: {
            backgroundColor: '#D9DADC',
        },
        reverse: {
            primaryColor: '#ffffff',
            textColor: '#ffffff',
            background: '#094DFF',
        },
        outline: { //For outlined icons and buttons
            fill: 'none', //Transparent
            primaryColor: '#ffffff',
            background: '#094DFF',
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: '#094DFF',
        },
        shadow: {
            shadow: {elevation: 10},
        },
        noShadow: {
            shadow: {elevation: 0},
        },
        noBorder: {
            borderWidth: 0,
            borderStyle: 'none',
            borderColor: 'transparent',
        },
        flat: {
            shadow: {elevation: 0},
            borderWidth: 0,
            borderStyle: 'none',
            borderColor: 'transparent',
            radius: 0
        }
    }
};