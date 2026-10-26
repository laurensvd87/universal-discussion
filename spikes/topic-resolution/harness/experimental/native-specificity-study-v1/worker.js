// Exactly seven reviewed staged files. batch-config.js is generated once by the
// future trusted stager from the authenticated canonical batch, never a message.
import {BATCH} from './batch-config.js';
import {createPageContentReader,attestContentDocument} from './chromium/page-content-reader.js';
import * as urlPolicy from './core/page-content-policy.js';
import {createNativeReaderTransfer} from './native-adapter.js';
import {createNativeDocumentRights,NativeDocumentRightsError} from './native-rights.js';
const chromeApi=globalThis.chrome;
Object.defineProperty(globalThis,'nativeReaderTransfer',{value:createNativeReaderTransfer({chromeApi,reader:createPageContentReader(chromeApi.scripting),urlPolicy,batch:BATCH}),writable:false,configurable:false});
Object.defineProperty(globalThis,'nativeDocumentRights',{value:createNativeDocumentRights({chromeApi,attestDocument:attestContentDocument,urlPolicy}),writable:false,configurable:false});
Object.defineProperty(globalThis,'isSpecificityRightsRefusal',{value:error=>{
 if(!error||Object.getPrototypeOf(error)!==NativeDocumentRightsError.prototype)return false;
 const d=Object.getOwnPropertyDescriptor(error,'code');return Boolean(d&&Object.hasOwn(d,'value')&&
 ['native-execution','document-mismatch','missing-head','head-budget','attribute-budget','directive-budget','capture-failed'].includes(d.value));
},writable:false,configurable:false});
