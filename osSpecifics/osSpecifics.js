import ReactDOM from 'react-dom';

//Emotion Imports
import {css} from '@emotion/css';

//Conditional Firestore Import
var firestore = {};
import('firebase/firestore').then(module => firestore = module).catch(warning => console.warn("[oneJS]: No Firestore module imported. If this is intentional, please disregard this warning: ", warning))

export const OSSPECIFICS = {
	os: 'web', 
	css: css, 
	systemLanguage: (window.navigator.userLanguage || window.navigator.language || 'en').substring(0, 2),
	firestore: firestore,
	ReactDOM: ReactDOM
};
