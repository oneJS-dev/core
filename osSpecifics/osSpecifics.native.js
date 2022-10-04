import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
export const OSSPECIFICS = {os: Platform.OS, AsyncStorage: AsyncStorage};
