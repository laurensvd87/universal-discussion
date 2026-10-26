// ADR168 four-case DEV MV3 service workers require static imports. Future reviewed staging supplies
// these exact unchanged production bytes; this source does not stage them.
import {createPageContentReader,attestContentDocument} from './chromium/page-content-reader.js';
import * as urlPolicy from './core/page-content-policy.js';
import {createNativeReaderTransfer,createTargetedSnapshotProbe} from './native-adapter.js';
import {createNativeDocumentRights,NativeDocumentRightsError} from './native-rights.js';

// No caller overrides or fallback. This is the owned study worker only, not the
// production application background or a pairing/account/native-write grant.
const chromeApi=globalThis.chrome;
const reader=createPageContentReader(chromeApi.scripting);
Object.defineProperty(globalThis,'nativeReaderTransfer',{
 value:createNativeReaderTransfer({chromeApi,reader,urlPolicy}),writable:false,configurable:false
});
const rights=createNativeDocumentRights({chromeApi,attestDocument:attestContentDocument,urlPolicy});
Object.defineProperty(globalThis,'nativeDocumentRights',{value:rights,writable:false,configurable:false});
Object.defineProperty(globalThis,'nativeArticleBadDocumentProbe',{
 value:createTargetedSnapshotProbe({rights,errorPrototype:NativeDocumentRightsError.prototype}),writable:false,configurable:false
});

