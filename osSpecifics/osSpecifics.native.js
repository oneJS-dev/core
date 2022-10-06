import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {useFonts} from 'expo-font';
import {registerRootComponent} from 'expo';

try {
	var firestore = require('firebase/firestore');
}
catch(warning) {
	//console.warn('[oneJS] osSpecifics: Failure to import modules. ', error);
}

export const OSSPECIFICS = {os: Platform.OS, AsyncStorage: AsyncStorage, useFonts: useFonts, firestore: firestore, registerRootComponent: registerRootComponent};
