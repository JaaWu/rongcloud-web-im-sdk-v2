module RongIMLib {
    export class RongIMClient {
        static Protobuf: any;
        static LogFactory: { [s: string]: any } = {};
        static MessageType: { [s: string]: any } = {};
        static MessageParams: { [s: string]: any };
        static RegisterMessage: { [s: string]: any } = {};
        static _memoryStore: any = { listenerList: [] };
        static isNotPullMsg: boolean = false;
        static _storageProvider: StorageProvider;
        static _dataAccessProvider: DataAccessProvider;
        static _voipProvider: VoIPProvider;
        private static _instance: RongIMClient;
        static bridge: any;
        static getInstance(): RongIMClient {
            if (!RongIMClient._instance) {
                throw new Error("RongIMClient is not initialized. Call .init() method first.");
            }
            return RongIMClient._instance;
        }
        static showErrorInfo: boolean = true;
        static showError(errorInfo: any): void {
            console.error(JSON.stringify(errorInfo));
        }
        static logger(params: any): void {
            var { funcName, code, desc } = params;
            var errorInfo = RongIMClient.LogFactory[code] || params;
            errorInfo.funcName = funcName;
            RongIMClient.showErrorInfo && RongIMClient.showError(errorInfo);
        }
        static logCallback(callback: any, funcName: string) {
            return {
                onSuccess: callback.onSuccess,
                onError: function(errorCode: ErrorCode) {
                    RongIMClient.logger({
                        code: errorCode,
                        funcName: funcName
                    });
                    callback.onError(errorCode);
                }
            };
        };

        static logSendCallback(callback: any, funcName: string) {
            return {
                onSuccess: callback.onSuccess,
                onError: function(errorCode: ErrorCode, result: Message) {
                    RongIMClient.logger({
                        code: errorCode,
                        funcName: funcName
                    });
                    callback.onError(errorCode, result);
                },
                onBefore: callback.onBefore
            };
        };

        /**
         * 初始化 SDK，在整个应用全局只需要调用一次。
         * @param appKey    开发者后台申请的 AppKey，用来标识应用。
         * @param dataAccessProvider 必须是DataAccessProvider的实例
         */

        static init(appKey: string, dataAccessProvider?: DataAccessProvider, options?: any, callback?:Function): void {
            if (!RongIMClient._instance) {
                RongIMClient._instance = new RongIMClient();
            }

            options = options || {};
            var protocol: string = "//", wsScheme = 'ws://';
            var protocols = 'http:,https:';
            if (protocols.indexOf(location.protocol) == -1) {
                protocol = 'http://';
            }
            if (location.protocol == 'https:') {
                wsScheme = 'wss://';
            }
            
            var isPolling = false;
            if(typeof WebSocket != 'function') {
                isPolling = true;
            }

            var supportUserData = function(){
                var element:any = document.documentElement;
                return element.addBehavior;
            };
            if (RongUtil.supportLocalStorage()) {
                RongIMClient._storageProvider = new RongIMLib.LocalStorageProvider();
            }
            else if (supportUserData()) {
                RongIMClient._storageProvider = new RongIMLib.UserDataProvider();
            }
            else {
                RongIMClient._storageProvider = new RongIMLib.MemeoryProvider();
            }
            
            var pathTmpl = '{0}{1}';

            var _serverPath:{[key:string]:any} = {
                navi: 'nav.cn.ronghub.com',
                api: 'api.cn.ronghub.com'
            };

            RongUtil.forEach(_serverPath, function(path: string, key: string){
                _serverPath[key] = RongUtil.stringFormat(pathTmpl, [protocol, path]);
            });

            RongUtil.forEach(_serverPath, function(path: any, key: string){
                var hasProto = (key in options);
                var config = {
                    path: options[key],
                    tmpl: pathTmpl,
                    protocol: protocol,
                    sub: true
                };
                path = hasProto ? RongUtil.formatProtoclPath(config) : path;
                options[key] = path;
            });
            
            var _sourcePath:{[key:string]:any} = {
                protobuf: 'cdn.ronghub.com/protobuf-2.2.7.min.js'
            };

            RongUtil.forEach(_sourcePath, function(path: string, key: string){
                _sourcePath[key] = RongUtil.stringFormat(pathTmpl, [protocol, path]);
            });

            RongUtil.extends(_sourcePath, options);

            var _defaultOpts:{[key:string]:any} = {
                isPolling: isPolling,
                wsScheme: wsScheme,
                protocol: protocol,
                openMp: true
            };
            
            RongUtil.extends(_defaultOpts, options);

            if (RongUtil.isFunction(options.protobuf)) {
                RongIMClient.Protobuf = options.protobuf;
            }

            var pather = new FeaturePatcher();
            pather.patchAll();
            var tempStore:any = {
                token: "",
                callback: null,
                lastReadTime: new LimitableMap(),
                conversationList: [],
                appKey: appKey,
                publicServiceMap: new PublicServiceMap(),
                providerType: 1,
                deltaTime: 0,
                filterMessages: [],
                isSyncRemoteConverList: true,
                otherDevice: false,
                custStore: {},
                converStore: { latestMessage: {} },
                connectAckTime: 0,
                voipStategy: 0,
                isFirstPingMsg: true,
                depend: options,
                listenerList: RongIMClient._memoryStore.listenerList,
                notification: {}
            };

            RongIMClient._memoryStore = tempStore;
            
            if (dataAccessProvider && Object.prototype.toString.call(dataAccessProvider) == "[object Object]") {
                RongIMClient._dataAccessProvider = dataAccessProvider;
            } else {
                RongIMClient._dataAccessProvider = new ServerDataProvider();
            }
            RongIMClient._dataAccessProvider.init(appKey, callback);
            // 兼容 c++ 设置导航，Web 端不生效
            RongIMClient._dataAccessProvider.setServerInfo({navi: location.protocol + options.navi +'/navi.xml' });
            RongIMClient.MessageParams = {
                TextMessage: { objectName: "RC:TxtMsg", msgTag: new MessageTag(true, true) },
                ImageMessage: { objectName: "RC:ImgMsg", msgTag: new MessageTag(true, true) },
                DiscussionNotificationMessage: { objectName: "RC:DizNtf", msgTag: new MessageTag(true, true) },
                VoiceMessage: { objectName: "RC:VcMsg", msgTag: new MessageTag(true, true) },
                RichContentMessage: { objectName: "RC:ImgTextMsg", msgTag: new MessageTag(true, true) },
                FileMessage: { objectName: "RC:FileMsg", msgTag: new MessageTag(true, true) },
                HandshakeMessage: { objectName: "", msgTag: new MessageTag(true, true) },
                UnknownMessage: { objectName: "", msgTag: new MessageTag(true, true) },
                LocationMessage: { objectName: "RC:LBSMsg", msgTag: new MessageTag(true, true) },
                InformationNotificationMessage: { objectName: "RC:InfoNtf", msgTag: new MessageTag(true, true) },
                ContactNotificationMessage: { objectName: "RC:ContactNtf", msgTag: new MessageTag(true, true) },
                ProfileNotificationMessage: { objectName: "RC:ProfileNtf", msgTag: new MessageTag(true, true) },
                CommandNotificationMessage: { objectName: "RC:CmdNtf", msgTag: new MessageTag(true, true) },
                PublicServiceRichContentMessage: { objectName: "RC:PSImgTxtMsg", msgTag: new MessageTag(true, true) },
                PublicServiceMultiRichContentMessage: { objectName: "RC:PSMultiImgTxtMsg", msgTag: new MessageTag(true, true) },
                JrmfReadPacketMessage : { objectName: "RCJrmf:RpMsg", msgTag: new MessageTag(true, true) },
                JrmfReadPacketOpenedMessage : { objectName: "RCJrmf:RpOpendMsg", msgTag: new MessageTag(true, true) },
                GroupNotificationMessage: { objectName: "RC:GrpNtf", msgTag: new MessageTag(true, true) },

                CommandMessage: { objectName: "RC:CmdMsg", msgTag: new MessageTag(false, false) },
                TypingStatusMessage: { objectName: "RC:TypSts", msgTag: new MessageTag(false, false) },
                PublicServiceCommandMessage: { objectName: "RC:PSCmd", msgTag: new MessageTag(false, false) },
                RecallCommandMessage: { objectName: "RC:RcCmd", msgTag: new MessageTag(false, true) },
                SyncReadStatusMessage: { objectName: "RC:SRSMsg", msgTag: new MessageTag(false, false) },
                ReadReceiptRequestMessage: { objectName: "RC:RRReqMsg", msgTag: new MessageTag(false, false) },
                ReadReceiptResponseMessage: { objectName: "RC:RRRspMsg", msgTag: new MessageTag(false, false) },

                ChangeModeResponseMessage: { objectName: "RC:CsChaR", msgTag: new MessageTag(false, false) },
                ChangeModeMessage: { objectName: "RC:CSCha", msgTag: new MessageTag(false, false) },
                EvaluateMessage: { objectName: "RC:CsEva", msgTag: new MessageTag(false, false) },
                CustomerContact: { objectName: "RC:CsContact", msgTag: new MessageTag(false, false) },
                HandShakeMessage: { objectName: "RC:CsHs", msgTag: new MessageTag(false, false) },
                HandShakeResponseMessage: { objectName: "RC:CsHsR", msgTag: new MessageTag(false, false) },
                SuspendMessage: { objectName: "RC:CsSp", msgTag: new MessageTag(false, false) },//主动发送
                TerminateMessage: { objectName: "RC:CsEnd", msgTag: new MessageTag(false, false) },
                CustomerStatusUpdateMessage: { objectName: "RC:CsUpdate", msgTag: new MessageTag(false, false) },
                ReadReceiptMessage: { objectName: "RC:ReadNtf", msgTag: new MessageTag(false, false) }
            };

            RongIMClient.MessageParams["AcceptMessage"] = { objectName: "RC:VCAccept", msgTag: new RongIMLib.MessageTag(false, false) };
            RongIMClient.MessageParams["RingingMessage"] = { objectName: "RC:VCRinging", msgTag: new RongIMLib.MessageTag(false, false) };
            RongIMClient.MessageParams["SummaryMessage"] = { objectName: "RC:VCSummary", msgTag: new RongIMLib.MessageTag(false, false) };
            RongIMClient.MessageParams["HungupMessage"] = { objectName: "RC:VCHangup", msgTag: new RongIMLib.MessageTag(false, false) };
            RongIMClient.MessageParams["InviteMessage"] = { objectName: "RC:VCInvite", msgTag: new RongIMLib.MessageTag(false, false) };
            RongIMClient.MessageParams["MediaModifyMessage"] = { objectName: "RC:VCModifyMedia", msgTag: new RongIMLib.MessageTag(false, false) };
            RongIMClient.MessageParams["MemberModifyMessage"] = { objectName: "RC:VCModifyMem", msgTag: new RongIMLib.MessageTag(false, false) };

            RongIMClient.MessageType = {
                TextMessage: "TextMessage",
                ImageMessage: "ImageMessage",
                DiscussionNotificationMessage: "DiscussionNotificationMessage",
                VoiceMessage: "VoiceMessage",
                RichContentMessage: "RichContentMessage",
                HandshakeMessage: "HandshakeMessage",
                UnknownMessage: "UnknownMessage",
                LocationMessage: "LocationMessage",
                InformationNotificationMessage: "InformationNotificationMessage",
                ContactNotificationMessage: "ContactNotificationMessage",
                ProfileNotificationMessage: "ProfileNotificationMessage",
                CommandNotificationMessage: "CommandNotificationMessage",
                CommandMessage: "CommandMessage",
                TypingStatusMessage: "TypingStatusMessage",
                ChangeModeResponseMessage: "ChangeModeResponseMessage",
                ChangeModeMessage: "ChangeModeMessage",
                EvaluateMessage: "EvaluateMessage",
                HandShakeMessage: "HandShakeMessage",
                HandShakeResponseMessage: "HandShakeResponseMessage",
                SuspendMessage: "SuspendMessage",
                TerminateMessage: "TerminateMessage",
                CustomerContact: "CustomerContact",
                CustomerStatusUpdateMessage: "CustomerStatusUpdateMessage",
                SyncReadStatusMessage: "SyncReadStatusMessage",
                ReadReceiptRequestMessage: "ReadReceiptRequestMessage",
                ReadReceiptResponseMessage: "ReadReceiptResponseMessage",
                FileMessage: 'FileMessage',
                AcceptMessage: "AcceptMessage",
                RingingMessage: "RingingMessage",
                SummaryMessage: "SummaryMessage",
                HungupMessage: "HungupMessage",
                InviteMessage: "InviteMessage",
                MediaModifyMessage: "MediaModifyMessage",
                MemberModifyMessage: "MemberModifyMessage",
                JrmfReadPacketMessage: "JrmfReadPacketMessage",
                JrmfReadPacketOpenedMessage: "JrmfReadPacketOpenedMessage",
                GroupNotificationMessage: "GroupNotificationMessage",
                PublicServiceRichContentMessage: "PublicServiceRichContentMessage",
                PublicServiceMultiRichContentMessage: "PublicServiceMultiRichContentMessage",
                PublicServiceCommandMessage: "PublicServiceCommandMessage",
                RecallCommandMessage: "RecallCommandMessage",
                ReadReceiptMessage: "ReadReceiptMessage"
            };

            RongIMClient.LogFactory = {
                /**
                 * 个人??????
                 */
                "-1": {
                    code: "-1",
                    msg: "超时???????????????????????????????"
                },
                "-2": {
                    code: "-2",
                    msg: "未知原因失败"
                },
                "20604": {
                    code: "20604",
                    msg: "发送频率过快",
                    desc: "https://developer.rongcloud.cn/ticket/info/9Q3L6vRKd1cLS7rycA==?type=1"
                },
                "20406": {
                    code: "20406",
                    msg: "被禁言"
                },
                "23407": {
                    code: "23407",
                    msg: "获取用户失败"
                },
                "405": {
                    code: "405",
                    msg: "在黑名单中"
                },
                "30001": {
                    code: "30001",
                    msg: "通信过程中，当前Socket不存在"
                },
                "30002": {
                    code: "30002",
                    msg: "Socket连接不可用"
                },
                "30003": {
                    code: "30003",
                    msg: "通信超时"
                },
                "30004": {
                    code: "30004",
                    msg: "导航操作时，Http请求失败"
                },
                "30005": {
                    code: "30005",
                    msg: "HTTP请求失败"
                },
                "30006": {
                    code: "30006",
                    msg: "HTTP接收失败"
                },
                /**
                 * 群组
                 */
                "20407": {
                    code: "20407",
                    msg: "群组Id无效"
                },
                "22408": {
                    code: "22408",
                    msg: "群组被禁言"
                },
                "22406": {
                    code: "22406",
                    msg: "不在群组"
                },
                /**
                 * 讨论组
                 */
                "21406": {
                    code: "21406",
                    msg: "不在讨论组"
                },
                "21407": {
                    code: "21407",
                    msg: "加入讨论失败"
                },
                "21408": {
                    code: "21408",
                    msg: "创建讨论组失败"
                },
                "21409": {
                    code: "21409",
                    msg: "设置讨论组邀请状态失败"
                },
                /**
                 * 聊天室
                 */
                "23406": {
                    code: "23406",
                    msg: "不在聊天室"
                },
                "23408": {
                    code: "23408",
                    msg: "聊天室被禁言"
                },
                "23409": {
                    code: "23409",
                    msg: "聊天室中成员被踢出"
                },
                "23410": {
                    code: "23410",
                    msg: "聊天室不存在"
                },
                "23411": {
                    code: "23411",
                    msg: "聊天室成员已满"
                },
                "23412": {
                    code: "23412",
                    msg: "获取聊天室信息参数无效"
                },
                "23413": {
                    code: "23413",
                    msg: "聊天室异常"
                },
                "23414": {
                    code: "23414",
                    msg: "没有打开聊天室消息存储"
                }
            };
            
        };

        /**
            var config = {
                appkey: appkey,
                token: token,
                dataAccessProvider:dataAccessProvider,
                opts: opts
            };
            callback(_instance, userId);
        */
        static initApp(config:any, callback:Function){
            RongIMClient.init(config.appkey, config.dataAccessProvider, config.opts, function(){
                var instance = RongIMClient._instance;
                //备用
                var error:any = null;
                callback(error, instance);
            });
        }

        /**
         * 连接服务器，在整个应用全局只需要调用一次，断线后 SDK 会自动重连。
         *
         * @param token     从服务端获取的用户身份令牌（Token）。
         * @param callback  连接回调，返回连接的成功或者失败状态。
         */
        static connect(token: string, callback: ConnectCallback, userId?: string): void {
            CheckParam.getInstance().check(["string", "object", "string|null|object|global|undefined"], "connect", true, arguments);
            RongIMClient._dataAccessProvider.connect(token, callback, userId);
        }

        static reconnect(callback: ConnectCallback, config?: any) {
            RongIMClient._dataAccessProvider.reconnect(callback, config);
        }
        /**
         * 注册消息类型，用于注册用户自定义的消息。
         * 内建的消息类型已经注册过，不需要再次注册。
         * 自定义消息声明需放在执行顺序最高的位置（在RongIMClient.init(appkey)之后即可）
         * @param objectName  消息内置名称
         */
        static registerMessageType(messageType: string, objectName: string, messageTag: MessageTag, messageContent: any): void {
            RongIMClient._dataAccessProvider.registerMessageType(messageType, objectName, messageTag, messageContent);
            RongIMClient.RegisterMessage[messageType].messageName = messageType;
            RongIMClient.MessageType[messageType] = messageType;
            RongIMClient.MessageParams[messageType] = { objectName: objectName, msgTag: messageTag };
        }

        /** 
         * 设置连接状态变化的监听器。
         *
         * @param listener  连接状态变化的监听器。
         */
        static setConnectionStatusListener(listener: ConnectionStatusListener): void {
            if(RongIMClient._dataAccessProvider) {
                RongIMClient._dataAccessProvider.setConnectionStatusListener(listener);
            }else{
                RongIMClient._memoryStore.listenerList.push(listener);
            }
        }

        /**
         * 设置接收消息的监听器。
         *
         * @param listener  接收消息的监听器。
         */
        static setOnReceiveMessageListener(listener: OnReceiveMessageListener): void {
            if(RongIMClient._dataAccessProvider) {
                RongIMClient._dataAccessProvider.setOnReceiveMessageListener(listener);
            }else{
                RongIMClient._memoryStore.listenerList.push(listener);
            }
        }
        /**
         * 清理所有连接相关的变量
         */
        logout() {
            RongIMClient._dataAccessProvider.logout();
        }
        /**
         * 断开连接。
         */
        disconnect(): void {
            RongIMClient._dataAccessProvider.disconnect();
        }

        startCustomService(custId: string, callback: any,groupId?: string): void {
            if (!custId || !callback) return;
            var msg: MessageContent;
            if(typeof groupId == 'undefined') {
                msg =  new HandShakeMessage();
            }else{
                msg = new HandShakeMessage({ groupid:groupId});
            }
            var me = this;
            RongIMLib.RongIMClient._memoryStore.custStore["isInit"] = true;
            RongIMClient.getInstance().sendMessage(ConversationType.CUSTOMER_SERVICE, custId, msg, <SendMessageCallback>{
                onSuccess: function(data: any) {
                    if (data.isBlack) {
                        callback.onError();
                        me.stopCustomeService(custId, {
                            onSuccess: function() { },
                            onError: function() { }
                        });
                    } else {
                        callback.onSuccess();
                    }
                },
                onError: function() {
                    callback.onError();
                },
                onBefore: function(){}
            });
        }

        stopCustomeService(custId: string, callback: any): void {
            if (!custId || !callback) return;
            var session: any = RongIMClient._memoryStore.custStore[custId];
            if (!session) return;
            var msg = new SuspendMessage({ sid: session.sid, uid: session.uid, pid: session.pid });
            this.sendCustMessage(custId, msg, {
                onSuccess: function() {
                    // delete RongIMClient._memoryStore.custStore[custId];
                    setTimeout(function() {
                        callback.onSuccess();
                    });
                },
                onError: function() {
                    setTimeout(function() {
                        callback.onError();
                    });
                }
            });
        }

        switchToHumanMode(custId: string, callback: any): void {
            if (!custId || !callback) return;
            var session: any = RongIMClient._memoryStore.custStore[custId];
            if (!session) return;
            var msg = new ChangeModeMessage({ sid: session.sid, uid: session.uid, pid: session.pid });
            this.sendCustMessage(custId, msg, callback)
        }

        evaluateRebotCustomService(custId: string, isRobotResolved: boolean, sugest: string, callback: any): void {
            if (!custId || !callback) return;
            var session: any = RongIMClient._memoryStore.custStore[custId];
            if (!session) return;
            var msg = new EvaluateMessage({ sid: session.sid, uid: session.uid, pid: session.pid, isRobotResolved: isRobotResolved, sugest: sugest, type: 0 });
            this.sendCustMessage(custId, msg, callback);
        }

        evaluateHumanCustomService(custId: string, humanValue: number, sugest: string, callback: any): void {
            if (!custId || !callback) return;
            var session: any = RongIMClient._memoryStore.custStore[custId];
            if (!session) return;
            var msg = new EvaluateMessage({ sid: session.sid, uid: session.uid, pid: session.pid, humanValue: humanValue, sugest: sugest, type: 1 });
            this.sendCustMessage(custId, msg, callback);
        }

        private sendCustMessage(custId: string, msg: MessageContent, callback: any): void {
            RongIMClient.getInstance().sendMessage(ConversationType.CUSTOMER_SERVICE, custId, msg, {
                onSuccess: function(data: any) {
                    callback.onSuccess();
                },
                onError: function() {
                    callback.onError();
                },
                onBefore: function(){}
            });
        }
        /**
         * 获取当前连接的状态。
         */
        getCurrentConnectionStatus(): ConnectionStatus {
            return RongIMClient._dataAccessProvider.getCurrentConnectionStatus();
        }

        /**
         * 获取当前使用的连接通道。
         */
        getConnectionChannel(): ConnectionChannel {
            if (Transportations._TransportType == Socket.XHR_POLLING) {
                return ConnectionChannel.XHR_POLLING;
            } else if (Transportations._TransportType == Socket.WEBSOCKET) {
                return ConnectionChannel.WEBSOCKET;
            }
        }

        /**
         * 获取当前使用的本地储存提供者。 TODO
         */
        getStorageProvider(): string {
            if (RongIMClient._memoryStore.providerType == 1) {
                return "ServerDataProvider";
            } else {
                return "OtherDataProvider";
            }
        }
        /**
         * 过滤聊天室消息（拉取最近聊天消息）
         * @param {string[]} msgFilterNames
         */
        setFilterMessages(msgFilterNames: string[]): void {
            if (Object.prototype.toString.call(msgFilterNames) == "[object Array]") {
                RongIMClient._memoryStore.filterMessages = msgFilterNames;
            }
        }
 
        getAgoraDynamicKey(engineType: number, channelName: string, callback: ResultCallback<string>) {
            CheckParam.getInstance().check(["number", "string", "object"], "getAgoraDynamicKey", false, arguments);
            var modules = new RongIMClient.Protobuf.VoipDynamicInput();
            modules.setEngineType(engineType);
            modules.setChannelName(channelName);
            RongIMClient.bridge.queryMsg(32, MessageUtil.ArrayForm(modules.toArrayBuffer()), Bridge._client.userId, callback, "VoipDynamicOutput");
        }

        /**
         * 获取当前连接用户的 UserId。
         */
        getCurrentUserId(): string {
            return Bridge._client.userId;
        }
        /**
         * 获取服务器时间与本地时间的差值，单位为毫秒。
         * 计算公式：差值 = 本地时间毫秒数 - 服务器时间毫秒数
         * @param callback  获取的回调，返回差值。
         */
        getDeltaTime(): number {
            return RongIMClient._dataAccessProvider.getDelaTime();
        }

        // #region Message

        getMessage(messageId: string, callback: ResultCallback<Message>) {
            RongIMClient._dataAccessProvider.getMessage(messageId, callback);
        }

        deleteLocalMessages(conversationType: ConversationType, targetId: string, messageIds: number[], callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.removeLocalMessage(conversationType, targetId, messageIds, callback);
        }

        updateMessage(message: Message, callback?: ResultCallback<Message>) {
            RongIMClient._dataAccessProvider.updateMessage(message, callback);
        }

        clearMessages(conversationType: ConversationType, targetId: string, callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.clearMessages(conversationType, targetId, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }
        /**TODO 清楚本地存储的未读消息，目前清空内存中的未读消息
         * [clearMessagesUnreadStatus 清空指定会话未读消息]
         * @param  {ConversationType}        conversationType [会话类型]
         * @param  {string}                  targetId         [用户id]
         * @param  {ResultCallback<boolean>} callback         [返回值，参数回调]
         */
        clearMessagesUnreadStatus(conversationType: ConversationType, targetId: string, callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.updateMessages(conversationType, targetId, "readStatus", null, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }

        deleteRemoteMessages(conversationType: ConversationType, targetId: string, delMsgs: DeleteMessage[], callback: ResultCallback<boolean>) {
            CheckParam.getInstance().check(["number", "string|number", "array", "object"], "deleteRemoteMessages", false, arguments);
            if (delMsgs.length == 0) {
                callback.onError(ErrorCode.DELETE_MESSAGE_ID_IS_NULL);
                return;
            } else if (delMsgs.length > 100) {
                delMsgs.length = 100;
            }
            // 后续增加，去掉注释即可
            callback.onSuccess(true);
            // var modules = new RongIMClient.Protobuf.DeleteMsgInput();
            // modules.setType(conversationType);
            // modules.setConversationId(targetId);
            // modules.setMsgs(delMsgs);
            // RongIMClient.bridge.queryMsg(33, MessageUtil.ArrayForm(modules.toArrayBuffer()), Bridge._client.userId, {
            //     onSuccess: function(info: any) {
            //         callback.onSuccess(true);
            //     },
            //     onError: function(err: any) {
            //         callback.onError(err);
            //     }
            // }, "DeleteMsgOutput");
        }
        /**
         * [deleteMessages 删除消息记录。]
         * @param  {ConversationType}        conversationType [description]
         * @param  {string}                  targetId         [description]
         * @param  {number[]}                messageIds       [description]
         * @param  {ResultCallback<boolean>} callback         [description]
         */
        deleteMessages(conversationType: ConversationType, targetId: string, delMsgs: DeleteMessage[], callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.removeMessage(conversationType, targetId, delMsgs, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }
        sendLocalMessage(message: Message, callback: SendMessageCallback) {
            CheckParam.getInstance().check(["object", "object"], "sendLocalMessage", false, arguments);
            RongIMClient._dataAccessProvider.updateMessage(message);
            this.sendMessage(message.conversationType, message.targetId, message.content, callback);
        }
        /**
         * [sendMessage 发送消息。]
         * @param  {ConversationType}        conversationType [会话类型]
         * @param  {string}                  targetId         [目标Id]
         * @param  {MessageContent}          messageContent   [消息类型]
         * @param  {SendMessageCallback}     sendCallback     []
         * @param  {ResultCallback<Message>} resultCallback   [返回值，函数回调]
         * @param  {string}                  pushContent      []
         * @param  {string}                  pushData         []
         */
        sendMessage(conversationType: ConversationType, targetId: string, messageContent: MessageContent, sendCallback: SendMessageCallback, mentiondMsg?: boolean, pushText?: string, appData?: string, methodType?: number, params?:any) {
            CheckParam.getInstance().check(["number", "string|number", "object", "object", "undefined|object|null|global|boolean", "undefined|object|null|global|string", "undefined|object|null|global|string", "undefined|object|null|global|number", "undefined|object|null|global"], "sendMessage", false, arguments);
            RongIMClient._dataAccessProvider.sendMessage(conversationType, targetId, messageContent, RongIMClient.logSendCallback(sendCallback, "sendMessage"), mentiondMsg, pushText, appData, methodType, params);
        }

        sendReceiptResponse(conversationType: ConversationType, targetId: string, sendCallback: SendMessageCallback) {
            RongIMClient._dataAccessProvider.sendReceiptResponse(conversationType, targetId, sendCallback);
        }

        sendTypingStatusMessage(conversationType: ConversationType, targetId: string, messageName: string, sendCallback: SendMessageCallback) {
            RongIMClient._dataAccessProvider.sendTypingStatusMessage(conversationType, targetId, messageName, sendCallback);
        }
        /**
         * [sendStatusMessage description]
         * @param  {MessageContent}          messageContent [description]
         * @param  {SendMessageCallback}     sendCallback   [description]
         * @param  {ResultCallback<Message>} resultCallback [description]
         */
        sendStatusMessage(messageContent: MessageContent, sendCallback: SendMessageCallback, resultCallback: ResultCallback<Message>) {
            throw new Error("Not implemented yet");
        }
        /**
         * [sendTextMessage 发送TextMessage快捷方式]
         * @param  {string}                  content        [消息内容]
         * @param  {ResultCallback<Message>} resultCallback [返回值，参数回调]
         */
        sendTextMessage(conversationType: ConversationType, targetId: string, content: string, sendMessageCallback: SendMessageCallback) {
            RongIMClient._dataAccessProvider.sendTextMessage(conversationType, targetId, content, sendMessageCallback);
        }

        sendRecallMessage(content:any, sendMessageCallback: SendMessageCallback): void {
            RongIMClient._dataAccessProvider.sendRecallMessage(content, sendMessageCallback);
        }
        /**
         * [insertMessage 向本地插入一条消息，不发送到服务器。]
         * @param  {ConversationType}        conversationType [description]
         * @param  {string}                  targetId         [description]
         * @param  {string}                  senderUserId     [description]
         * @param  {MessageContent}          content          [description]
         * @param  {ResultCallback<Message>} callback         [description]
         */
        insertMessage(conversationType: ConversationType, targetId: string, senderUserId: string, content: Message, callback: ResultCallback<Message>) {
            RongIMClient._dataAccessProvider.addMessage(conversationType, targetId, content, callback);
        }
        /**
         * [getHistoryMessages 拉取历史消息记录。]
         * @param  {ConversationType}          conversationType [会话类型]
         * @param  {string}                    targetId         [用户Id]
         * @param  {number|null}               pullMessageTime  [拉取历史消息起始位置(格式为毫秒数)，可以为null]
         * @param  {number}                    count            [历史消息数量]
         * @param  {ResultCallback<Message[]>} callback         [回调函数]
         * @param  {string}                    objectName       [objectName]
         */
        getHistoryMessages(conversationType: ConversationType, targetId: string, timestamp: number, count: number, callback: GetHistoryMessagesCallback, objectname?:string, direction?: boolean) {
            CheckParam.getInstance().check(["number", "string|number", "number|null|global|object", "number", "object", "undefined|object|null|global|string", "boolean|null|global|object"], "getHistoryMessages", false, arguments);
            if (count > 20) {
                throw new Error("HistroyMessage count must be less than or equal to 20!");
            }
            if (conversationType.valueOf() < 0) {
                throw new Error("ConversationType must be greater than -1");
            }
            RongIMClient._dataAccessProvider.getHistoryMessages(conversationType, targetId, timestamp, count, callback, objectname, direction);
        }

        setMessageContent(messageId:number, content:any, objectName: string):void{
             RongIMClient._dataAccessProvider.setMessageContent(messageId, content, objectName);   
        };

        /**
         * [getRemoteHistoryMessages 拉取某个时间戳之前的消息]
         * @param  {ConversationType}          conversationType [description]
         * @param  {string}                    targetId         [description]
         * @param  {Date}                      dateTime         [description]
         * @param  {number}                    count            [description]
         * @param  {ResultCallback<Message[]>} callback         [description]
         */
        getRemoteHistoryMessages(conversationType: ConversationType, targetId: string, timestamp: number, count: number, callback: GetHistoryMessagesCallback) {
            CheckParam.getInstance().check(["number", "string|number", "number|null|global|object", "number", "object"], "getRemoteHistoryMessages", false, arguments);
            if (count > 20) {
                callback.onError(ErrorCode.RC_CONN_PROTO_VERSION_ERROR);
                return;
            }
            if (conversationType.valueOf() < 0) {
                callback.onError(ErrorCode.RC_CONN_PROTO_VERSION_ERROR);
                return;
            }
            RongIMClient._dataAccessProvider.getRemoteHistoryMessages(conversationType, targetId, timestamp, count, callback);
        }
        /**
         * [hasRemoteUnreadMessages 是否有未接收的消息，jsonp方法]
         * @param  {string}          appkey   [appkey]
         * @param  {string}          token    [token]
         * @param  {ConnectCallback} callback [返回值，参数回调]
         */
        hasRemoteUnreadMessages(token: string, callback: ResultCallback<Boolean>) {
            RongIMClient._dataAccessProvider.hasRemoteUnreadMessages(token, callback);
        }
        getTotalUnreadCount(callback: ResultCallback<number>, conversationTypes?: number[]) {
            RongIMClient._dataAccessProvider.getTotalUnreadCount({
                onSuccess: function(count: number) {
                    setTimeout(function() {
                        callback.onSuccess(count);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            }, conversationTypes);
        }
        /**
         * [getConversationUnreadCount 指定多种会话类型获取未读消息数]
         * @param  {ResultCallback<number>} callback             [返回值，参数回调。]
         * @param  {ConversationType[]}     ...conversationTypes [会话类型。]
         */
        getConversationUnreadCount(conversationTypes: ConversationType[], callback: ResultCallback<number>) {
            RongIMClient._dataAccessProvider.getConversationUnreadCount(conversationTypes, {
                onSuccess: function(count: number) {
                    setTimeout(function() {
                        callback.onSuccess(count);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }
        /**
         * [getUnreadCount 指定用户、会话类型的未读消息总数。]
         * @param  {ConversationType} conversationType [会话类型]
         * @param  {string}           targetId         [用户Id]
         */
        getUnreadCount(conversationType: ConversationType, targetId: string, callback: ResultCallback<number>) {
            RongIMClient._dataAccessProvider.getUnreadCount(conversationType, targetId, {
                onSuccess: function(count: number) {
                    setTimeout(function() {
                        callback.onSuccess(count);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }

        clearUnreadCountByTimestamp(conversationType: ConversationType, targetId: string, timestamp:number, callback: ResultCallback<boolean>) : void{
           RongIMClient._dataAccessProvider.clearUnreadCountByTimestamp(conversationType, targetId, timestamp, callback);
        }

        /**
         * 清楚会话未读消息数
         * @param  {ConversationType}        conversationType 会话类型
         * @param  {string}                  targetId         目标Id
         * @param  {ResultCallback<boolean>} callback         返回值，函数回调
         */
        clearUnreadCount(conversationType: ConversationType, targetId: string, callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.clearUnreadCount(conversationType, targetId, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }

        clearLocalStorage(callback: any): void {
            RongIMClient._storageProvider.clearItem();
            callback();
        }

        setMessageExtra(messageId: string, value: string, callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.setMessageExtra(messageId, value, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }

        setMessageReceivedStatus(messageUId: string, receivedStatus: ReceivedStatus, callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.setMessageReceivedStatus(messageUId, receivedStatus, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }

        setMessageStatus(conersationType:ConversationType, targetId: string, timestamp:number, status: string, callback: ResultCallback<boolean>){
            RongIMClient._dataAccessProvider.setMessageStatus(conersationType, targetId, timestamp, status, callback);
        }

        setMessageSentStatus(messageId: string, sentStatus: SentStatus, callback: ResultCallback<boolean>) {
            RongIMClient._dataAccessProvider.setMessageSentStatus(messageId, sentStatus, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }

        // #endregion Message

        // #region TextMessage Draft
        /**
         * clearTextMessageDraft 清除指定会话和消息类型的草稿。
         * @param  {ConversationType}        conversationType 会话类型
         * @param  {string}                  targetId         目标Id
         */
        clearTextMessageDraft(conversationType: ConversationType, targetId: string): boolean {
            CheckParam.getInstance().check(["number", "string|number", "object"], "clearTextMessageDraft", false, arguments);
            var key: string = "darf_" + conversationType + "_" + targetId;
            delete RongIMClient._memoryStore[key];
            return true;
        }
        /**
         * [getTextMessageDraft 获取指定消息和会话的草稿。]
         * @param  {ConversationType}       conversationType [会话类型]
         * @param  {string}                 targetId         [目标Id]
         */
        getTextMessageDraft(conversationType: ConversationType, targetId: string): string {
            CheckParam.getInstance().check(["number", "string|number", "object"], "getTextMessageDraft", false, arguments);
            if (targetId == "" || conversationType < 0) {
                throw new Error("params error : " + ErrorCode.DRAF_GET_ERROR);
            }
            var key: string = "darf_" + conversationType + "_" + targetId;
            return RongIMClient._memoryStore[key];
        }
        /**
         * [saveTextMessageDraft description]
         * @param  {ConversationType}        conversationType [会话类型]
         * @param  {string}                  targetId         [目标Id]
         * @param  {string}                  value            [草稿值]
         */
        saveTextMessageDraft(conversationType: ConversationType, targetId: string, value: string): boolean {
            CheckParam.getInstance().check(["number", "string|number", "string", "object"], "saveTextMessageDraft", false, arguments);
            var key: string = "darf_" + conversationType + "_" + targetId;
            RongIMClient._memoryStore[key] = value;
            return true;
        }

        // #endregion TextMessage Draft

        // #region Conversation

        searchConversationByContent(keyword: string, callback: ResultCallback<Conversation[]>, conversationTypes?: ConversationType[]): void {
            RongIMClient._dataAccessProvider.searchConversationByContent(keyword, callback, conversationTypes);
        }

        searchMessageByContent(conversationType: ConversationType, targetId: string, keyword: string, timestamp: number, count: number, total: number, callback: ResultCallback<Message[]>): void {
            RongIMClient._dataAccessProvider.searchMessageByContent(conversationType, targetId, keyword, timestamp, count, total, callback);
        }

        clearConversations(callback: ResultCallback<boolean>, ...conversationTypes: ConversationType[]) {
            if (conversationTypes.length == 0) {
                conversationTypes = [RongIMLib.ConversationType.CHATROOM,
                RongIMLib.ConversationType.CUSTOMER_SERVICE,
                RongIMLib.ConversationType.DISCUSSION,
                RongIMLib.ConversationType.GROUP,
                RongIMLib.ConversationType.PRIVATE,
                RongIMLib.ConversationType.SYSTEM,
                RongIMLib.ConversationType.PUBLIC_SERVICE,
                RongIMLib.ConversationType.APP_PUBLIC_SERVICE];
            }
            RongIMClient._dataAccessProvider.clearConversations(conversationTypes, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }
        /**
         * [getConversation 获取指定会话，此方法需在getConversationList之后执行]
         * @param  {ConversationType}             conversationType [会话类型]
         * @param  {string}                       targetId         [目标Id]
         * @param  {ResultCallback<Conversation>} callback         [返回值，函数回调]
         */
        getConversation(conversationType: ConversationType, targetId: string, callback: ResultCallback<Conversation>) {
            CheckParam.getInstance().check(["number", "string|number", "object"], "getConversation", false, arguments);
            RongIMClient._dataAccessProvider.getConversation(conversationType, targetId, {
                onSuccess: function(conver: Conversation) {
                    setTimeout(function() {
                        callback.onSuccess(conver);
                    });
                },
                onError: function(error: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(error);
                    });
                }
            });

        }
        /**
         * [pottingConversation 组装会话列表]
         * @param {any} tempConver [临时会话]
         * conver_conversationType_targetId_no.
         * msg_conversationType_targetId_no.
         */
        pottingConversation(tempConver: any): void {
            var self = this, isUseReplace: boolean = false;
            RongIMClient._dataAccessProvider.getConversation(tempConver.type, tempConver.userId, {
                onSuccess: function(conver: Conversation) {
                    if (!conver) {
                        conver = new Conversation();
                    } else {
                        isUseReplace = true;
                    }
                    conver.conversationType = tempConver.type;
                    conver.targetId = tempConver.userId;
                    conver.latestMessage = MessageUtil.messageParser(tempConver.msg);
                    conver.latestMessageId = conver.latestMessage.messageId;
                    conver.objectName = conver.latestMessage.objectName;
                    conver.receivedStatus = conver.latestMessage.receivedStatus;
                    conver.receivedTime = conver.latestMessage.receiveTime;
                    conver.sentStatus = conver.latestMessage.sentStatus;
                    conver.sentTime = conver.latestMessage.sentTime;
                    var mentioneds = RongIMClient._storageProvider.getItem("mentioneds_" + Bridge._client.userId + '_' + conver.conversationType + '_' + conver.targetId);
                    if (mentioneds) {
                        var info = JSON.parse(mentioneds);
                        conver.mentionedMsg = info[tempConver.type + "_" + tempConver.userId];
                    }
                    if (!isUseReplace) {
                        if (RongUtil.supportLocalStorage()) {
                            var count = RongIMClient._storageProvider.getItem("cu" + Bridge._client.userId + tempConver.type + tempConver.userId);
                            conver.unreadMessageCount = Number(count);
                        } else {
                            conver.unreadMessageCount = 0;
                        }
                    }
                    if (conver.conversationType == ConversationType.DISCUSSION) {
                        self.getDiscussion(tempConver.userId, {
                            onSuccess: function(info: Discussion) {
                                conver.conversationTitle = info.name;
                            },
                            onError: function(error: ErrorCode) { }
                        });
                    }
                    RongIMClient._dataAccessProvider.addConversation(conver, <ResultCallback<boolean>>{ onSuccess: function(data: boolean) { } });
                },
                onError: function(error: ErrorCode) { }
            });

        }

        addConversation(conversation: Conversation, callback:any):void{
            RongIMClient._dataAccessProvider.addConversation(conversation, callback);
        }

        private sortConversationList(conversationList: Conversation[]) {
            var convers: Conversation[] = [];
            for (var i = 0, len = conversationList.length; i < len; i++) {
                if(!conversationList[i]) {
                    continue;
                }
                if (conversationList[i].isTop) {
                    convers.push(conversationList[i]);
                    conversationList.splice(i, 1);
                    continue;
                }
                for (var j = 0; j < len - i - 1; j++) {
                    if (conversationList[j].sentTime < conversationList[j + 1].sentTime) {
                        var swap = conversationList[j];
                        conversationList[j] = conversationList[j + 1];
                        conversationList[j + 1] = swap;
                    }
                }
            }
            return RongIMClient._memoryStore.conversationList = convers.concat(conversationList);
        }
        getConversationList(callback: ResultCallback<Conversation[]>, conversationTypes: ConversationType[], count: number,isGetHiddenConvers:boolean) {
            CheckParam.getInstance().check(["object", "null|undefined|array|object|global", "number|undefined|null|object|global","boolean|undefined|null|object|global"], "getConversationList", false, arguments);
            var me = this;
            RongIMClient._dataAccessProvider.getConversationList(<ResultCallback<Conversation[]>>{
                onSuccess: function(data: Conversation[]) {
                    if (conversationTypes || RongIMClient._dataAccessProvider) {
                        setTimeout(function() {
                            callback.onSuccess(data);
                        });
                    } else {
                        setTimeout(function() {
                            callback.onSuccess(RongIMClient._memoryStore.conversationList);
                        });
                    }
                },
                onError: function(error: ErrorCode) {
                    setTimeout(function(){
                        callback.onError(error);
                    });
                }
            }, conversationTypes, count,isGetHiddenConvers);
        }
        getRemoteConversationList(callback: ResultCallback<Conversation[]>, conversationTypes: ConversationType[], count: number,isGetHiddenConvers:boolean) {
            CheckParam.getInstance().check(["object", "null|array|object|global", "number|undefined|null|object|global","boolean|undefined|null|object|global"], "getRemoteConversationList", false, arguments);
            RongIMClient._dataAccessProvider.getRemoteConversationList(callback, conversationTypes, count,isGetHiddenConvers);
        }

        updateConversation(conversation: Conversation): Conversation {
            return RongIMClient._dataAccessProvider.updateConversation(conversation);
        }

        /**
         * [createConversation 创建会话。]
         * @param  {number}  conversationType [会话类型]
         * @param  {string}  targetId         [目标Id]
         * @param  {string}  converTitle      [会话标题]
         * @param  {boolean} islocal          [是否同步到服务器，ture：同步，false:不同步]
         */
        createConversation(conversationType: number, targetId: string, converTitle: string): Conversation {
            CheckParam.getInstance().check(["number", "string|number", "string"], "createConversation", false, arguments);
            var conver = new Conversation();
            conver.targetId = targetId;
            conver.conversationType = conversationType;
            conver.conversationTitle = converTitle;
            conver.latestMessage = {};
            conver.unreadMessageCount = 0;
            return conver;
        }
        //TODO 删除本地和服务器、删除本地和服务器分开
        removeConversation(conversationType: ConversationType, targetId: string, callback: ResultCallback<boolean>) {
            CheckParam.getInstance().check(["number", "string|number", "object"], "removeConversation", false, arguments);
            RongIMClient._dataAccessProvider.removeConversation(conversationType, targetId, callback);
        }

        setConversationHidden(conversationType: ConversationType, targetId: string,isHidden:boolean):void{
            CheckParam.getInstance().check(["number", "string|number", "boolean"], "setConversationHidden", false, arguments);
            RongIMClient._dataAccessProvider.setConversationHidden(conversationType,targetId,isHidden);
        }

        setConversationToTop(conversationType: ConversationType, targetId: string, isTop: boolean, callback: ResultCallback<boolean>) {
            CheckParam.getInstance().check(["number", "string|number", "boolean", "object"], "setConversationToTop", false, arguments);
            RongIMClient._dataAccessProvider.setConversationToTop(conversationType, targetId, isTop, {
                onSuccess: function(bool: boolean) {
                    setTimeout(function() {
                        callback.onSuccess(bool);
                    });
                },
                onError: function(errorCode: ErrorCode) {
                    setTimeout(function() {
                        callback.onError(errorCode);
                    });
                }
            });
        }

        // #endregion Conversation

        // #region Notifications
        /**
         * [getConversationNotificationStatus 获取指定用户和会话类型免提醒。]
         * @param  {ConversationType}                               conversationType [会话类型]
         * @param  {string}                                         targetId         [目标Id]
         * @param  {ResultCallback<ConversationNotificationStatus>} callback         [返回值，函数回调]
         */
        getConversationNotificationStatus(conversationType: ConversationType, targetId: string, callback: ResultCallback<ConversationNotificationStatus>) {
            var params = {
                conversationType: conversationType,
                targetId: targetId
            };
            RongIMClient._dataAccessProvider.getConversationNotificationStatus(params, callback);
        }
        /**
         * [setConversationNotificationStatus 设置指定用户和会话类型免提醒。]
         * @param  {ConversationType}                               conversationType [会话类型]
         * @param  {string}                                         targetId         [目标Id]
         * @param  {ResultCallback<ConversationNotificationStatus>} callback         [返回值，函数回调]
         */
        setConversationNotificationStatus(conversationType: ConversationType, targetId: string, notificationStatus: ConversationNotificationStatus, callback: ResultCallback<ConversationNotificationStatus>) {
            var params = {
                conversationType: conversationType,
                targetId: targetId,
                status: status
            };
            RongIMClient._dataAccessProvider.setConversationNotificationStatus(params, callback);
        }
        /**
         * [getNotificationQuietHours 获取免提醒消息时间。]
         * @param  {GetNotificationQuietHoursCallback} callback [返回值，函数回调]
         */
        getNotificationQuietHours(callback: GetNotificationQuietHoursCallback) {
            throw new Error("Not implemented yet");
        }
        /**
         * [removeNotificationQuietHours 移除免提醒消息时间。]
         * @param  {GetNotificationQuietHoursCallback} callback [返回值，函数回调]
         */
        removeNotificationQuietHours(callback: OperationCallback) {
            throw new Error("Not implemented yet");
        }
        /**
         * [setNotificationQuietHours 设置免提醒消息时间。]
         * @param  {GetNotificationQuietHoursCallback} callback [返回值，函数回调]
         */
        setNotificationQuietHours(startTime: string, spanMinutes: number, callback: OperationCallback) {
            throw new Error("Not implemented yet");
        }

        // #endregion Notifications

        // #region Discussion
        /**
         * [addMemberToDiscussion   加入讨论组]
         * @param  {string}            discussionId [讨论组Id]
         * @param  {string[]}          userIdList   [讨论中成员]
         * @param  {OperationCallback} callback     [返回值，函数回调]
         */
        addMemberToDiscussion(discussionId: string, userIdList: string[], callback: OperationCallback) {
            CheckParam.getInstance().check(["string", "array", "object"], "addMemberToDiscussion", false, arguments);
            RongIMClient._dataAccessProvider.addMemberToDiscussion(discussionId, userIdList, callback);
        }
        /**
         * [createDiscussion 创建讨论组]
         * @param  {string}                   name       [讨论组名称]
         * @param  {string[]}                 userIdList [讨论组成员]
         * @param  {CreateDiscussionCallback} callback   [返回值，函数回调]
         */
        createDiscussion(name: string, userIdList: string[], callback: CreateDiscussionCallback) {
            CheckParam.getInstance().check(["string", "array", "object"], "createDiscussion", false, arguments);
            RongIMClient._dataAccessProvider.createDiscussion(name, userIdList, callback);
        }
        /**
         * [getDiscussion 获取讨论组信息]
         * @param  {string}                     discussionId [讨论组Id]
         * @param  {ResultCallback<Discussion>} callback     [返回值，函数回调]
         */
        getDiscussion(discussionId: string, callback: ResultCallback<Discussion>) {
            CheckParam.getInstance().check(["string", "object"], "getDiscussion", false, arguments);
            RongIMClient._dataAccessProvider.getDiscussion(discussionId, callback);
        }
        /**
         * [quitDiscussion 退出讨论组]
         * @param  {string}            discussionId [讨论组Id]
         * @param  {OperationCallback} callback     [返回值，函数回调]
         */
        quitDiscussion(discussionId: string, callback: OperationCallback) {
            CheckParam.getInstance().check(["string", "object"], "quitDiscussion", false, arguments);
            RongIMClient._dataAccessProvider.quitDiscussion(discussionId, callback);
        }
        /**
         * [removeMemberFromDiscussion 将指定成员移除讨论租]
         * @param  {string}            discussionId [讨论组Id]
         * @param  {string}            userId       [被移除的用户Id]
         * @param  {OperationCallback} callback     [返回值，参数回调]
         */
        removeMemberFromDiscussion(discussionId: string, userId: string, callback: OperationCallback) {
            CheckParam.getInstance().check(["string", "string", "object"], "removeMemberFromDiscussion", false, arguments);
            RongIMClient._dataAccessProvider.removeMemberFromDiscussion(discussionId, userId, callback);
        }
        /**
         * [setDiscussionInviteStatus 设置讨论组邀请状态]
         * @param  {string}                 discussionId [讨论组Id]
         * @param  {DiscussionInviteStatus} status       [邀请状态]
         * @param  {OperationCallback}      callback     [返回值，函数回调]
         */
        setDiscussionInviteStatus(discussionId: string, status: DiscussionInviteStatus, callback: OperationCallback) {
            CheckParam.getInstance().check(["string", "number", "object"], "setDiscussionInviteStatus", false, arguments);
            RongIMClient._dataAccessProvider.setDiscussionInviteStatus(discussionId, status, callback);
        }
        /**
         * [setDiscussionName 设置讨论组名称]
         * @param  {string}            discussionId [讨论组Id]
         * @param  {string}            name         [讨论组名称]
         * @param  {OperationCallback} callback     [返回值，函数回调]
         */
        setDiscussionName(discussionId: string, name: string, callback: OperationCallback) {
            CheckParam.getInstance().check(["string", "string", "object"], "setDiscussionName", false, arguments);
            RongIMClient._dataAccessProvider.setDiscussionName(discussionId, name, callback);
        }

        // #endregion Discussion

        // #region ChatRoom
        /**
         * [加入聊天室。]
         * @param  {string}            chatroomId   [聊天室Id]
         * @param  {number}            messageCount [拉取消息数量，-1为不拉去消息]
         * @param  {OperationCallback} callback     [返回值，函数回调]
         */
        joinChatRoom(chatroomId: string, messageCount: number, callback: OperationCallback) {
            CheckParam.getInstance().check(["string|number", "number", "object"], "joinChatRoom", false, arguments);
            if (chatroomId == "") {
                setTimeout(function() {
                    callback.onError(ErrorCode.CHATROOM_ID_ISNULL);
                });
                return;
            }
            RongIMClient._dataAccessProvider.joinChatRoom(chatroomId, messageCount, callback);
        }

        setChatroomHisMessageTimestamp(chatRoomId:string, timestamp:number):void{
            CheckParam.getInstance().check(["string|number", "number"], "setChatroomHisMessageTimestamp", false, arguments);
            RongIMClient._dataAccessProvider.setChatroomHisMessageTimestamp(chatRoomId, timestamp);
        }
        getChatRoomHistoryMessages(chatRoomId:string, count:number, order:number, callback:ResultCallback<Message>):void{
            CheckParam.getInstance().check(["string|number", "number", "number", "object"], "getChatRoomHistoryMessages", false, arguments);
            RongIMClient._dataAccessProvider.getChatRoomHistoryMessages(chatRoomId, count, order, callback);
        }

        getChatRoomInfo(chatRoomId: string, count: number, order: GetChatRoomType, callback: ResultCallback<any>) {
            CheckParam.getInstance().check(["string|number", "number", "number", "object"], "getChatRoomInfo", false, arguments);
            RongIMClient._dataAccessProvider.getChatRoomInfo(chatRoomId, count, order, callback);
        }
        /**
         * [退出聊天室]
         * @param  {string}            chatroomId [聊天室Id]
         * @param  {OperationCallback} callback   [返回值，函数回调]
         */
        quitChatRoom(chatroomId: string, callback: OperationCallback) {
            CheckParam.getInstance().check(["string|number", "object"], "quitChatRoom", false, arguments);
            RongIMClient._dataAccessProvider.quitChatRoom(chatroomId, callback);
        }

        // #endregion ChatRoom

        // #region Public Service
        getRemotePublicServiceList(callback?: ResultCallback<PublicServiceProfile[]>, pullMessageTime?: any) {
            RongIMClient._dataAccessProvider.getRemotePublicServiceList(callback, pullMessageTime);
        }
        /**
         * [getPublicServiceList ]获取本地的公共账号列表
         * @param  {ResultCallback<PublicServiceProfile[]>} callback [返回值，参数回调]
         */
        getPublicServiceList(callback: ResultCallback<PublicServiceProfile[]>) {
            if (RongIMClient._memoryStore.depend.openMp) {
                CheckParam.getInstance().check(["object"], "getPublicServiceList", false, arguments);
                this.getRemotePublicServiceList(callback);
            }
        }
        /**
         * [getPublicServiceProfile ]   获取某公共服务信息。
         * @param  {PublicServiceType}                    publicServiceType [公众服务类型。]
         * @param  {string}                               publicServiceId   [公共服务 Id。]
         * @param  {ResultCallback<PublicServiceProfile>} callback          [公共账号信息回调。]
         */
        getPublicServiceProfile(publicServiceType: ConversationType, publicServiceId: string, callback: ResultCallback<PublicServiceProfile>) {
            if (RongIMClient._memoryStore.depend.openMp) {
                CheckParam.getInstance().check(["number", "string|number", "object"], "getPublicServiceProfile", false, arguments);
                RongIMClient._dataAccessProvider.getPublicServiceProfile(publicServiceType, publicServiceId, callback);
            }
        }

        /**
         * [pottingPublicSearchType ] 公众好查询类型
         * @param  {number} bussinessType [ 0-all 1-mp 2-mc]
         * @param  {number} searchType    [0-exact 1-fuzzy]
         */
        private pottingPublicSearchType(bussinessType: number, searchType: number): number {
            if (RongIMClient._memoryStore.depend.openMp) {
                var bits = 0;
                if (bussinessType == 0) {
                    bits |= 3;
                    if (searchType == 0) {
                        bits |= 12;
                    } else {
                        bits |= 48;
                    }
                }
                else if (bussinessType == 1) {
                    bits |= 1;
                    if (searchType == 0) {
                        bits |= 8;
                    } else {
                        bits |= 32;
                    }
                }
                else {
                    bits |= 2;
                    if (bussinessType == 0) {
                        bits |= 4;
                    } else {
                        bits |= 16;
                    }
                }
                return bits;
            }
        }
        /**
         * [searchPublicService ]按公众服务类型搜索公众服务。
         * @param  {SearchType}                             searchType [搜索类型枚举。]
         * @param  {string}                                 keywords   [搜索关键字。]
         * @param  {ResultCallback<PublicServiceProfile[]>} callback   [搜索结果回调。]
         */
        searchPublicService(searchType: SearchType, keywords: string, callback: ResultCallback<PublicServiceProfile[]>) {
            if (RongIMClient._memoryStore.depend.openMp) {
                CheckParam.getInstance().check(["number", "string", "object"], "searchPublicService", false, arguments);
                var modules = new RongIMClient.Protobuf.SearchMpInput();
                modules.setType(this.pottingPublicSearchType(0, searchType));
                modules.setId(keywords);
                RongIMClient.bridge.queryMsg(29, MessageUtil.ArrayForm(modules.toArrayBuffer()), Bridge._client.userId, callback, "SearchMpOutput");
            }
        }
        /**
         * [searchPublicServiceByType ]按公众服务类型搜索公众服务。
         * @param  {PublicServiceType}                      publicServiceType [公众服务类型。]
         * @param  {SearchType}                             searchType        [搜索类型枚举。]
         * @param  {string}                                 keywords          [搜索关键字。]
         * @param  {ResultCallback<PublicServiceProfile[]>} callback          [搜索结果回调。]
         */
        searchPublicServiceByType(publicServiceType: ConversationType, searchType: SearchType, keywords: string, callback: ResultCallback<PublicServiceProfile[]>) {
            if (RongIMClient._memoryStore.depend.openMp) {
                CheckParam.getInstance().check(["number", "number", "string", "object"], "searchPublicServiceByType", false, arguments);
                var type: number = publicServiceType == ConversationType.APP_PUBLIC_SERVICE ? 2 : 1;
                var modules: any = new RongIMClient.Protobuf.SearchMpInput();
                modules.setType(this.pottingPublicSearchType(type, searchType));
                modules.setId(keywords);
                RongIMClient.bridge.queryMsg(29, MessageUtil.ArrayForm(modules.toArrayBuffer()), Bridge._client.userId, callback, "SearchMpOutput");
            }
        }
        /**
         * [subscribePublicService ] 订阅公众号。
         * @param  {PublicServiceType} publicServiceType [公众服务类型。]
         * @param  {string}            publicServiceId   [公共服务 Id。]
         * @param  {OperationCallback} callback          [订阅公众号回调。]
         */
        subscribePublicService(publicServiceType: ConversationType, publicServiceId: string, callback: OperationCallback) {
            if (RongIMClient._memoryStore.depend.openMp) {
                CheckParam.getInstance().check(["number", "string|number", "object"], "subscribePublicService", false, arguments);
                var modules = new RongIMClient.Protobuf.MPFollowInput(), me = this, follow = publicServiceType == ConversationType.APP_PUBLIC_SERVICE ? "mcFollow" : "mpFollow";
                modules.setId(publicServiceId);
                RongIMClient.bridge.queryMsg(follow, MessageUtil.ArrayForm(modules.toArrayBuffer()), Bridge._client.userId, {
                    onSuccess: function() {
                        me.getRemotePublicServiceList(<ResultCallback<PublicServiceProfile[]>>{
                            onSuccess: function() { },
                            onError: function() { }
                        });
                        callback.onSuccess();
                    },
                    onError: function(code: ErrorCode) {
                        callback.onError(code);
                    }
                }, "MPFollowOutput");
            }
        }
        /**
         * [unsubscribePublicService ] 取消订阅公众号。
         * @param  {PublicServiceType} publicServiceType [公众服务类型。]
         * @param  {string}            publicServiceId   [公共服务 Id。]
         * @param  {OperationCallback} callback          [取消订阅公众号回调。]
         */
        unsubscribePublicService(publicServiceType: ConversationType, publicServiceId: string, callback: OperationCallback) {
            if (RongIMClient._memoryStore.depend.openMp) {
                CheckParam.getInstance().check(["number", "string|number", "object"], "unsubscribePublicService", false, arguments);
                var modules = new RongIMClient.Protobuf.MPFollowInput(), me = this, follow = publicServiceType == ConversationType.APP_PUBLIC_SERVICE ? "mcUnFollow" : "mpUnFollow";
                modules.setId(publicServiceId);
                RongIMClient.bridge.queryMsg(follow, MessageUtil.ArrayForm(modules.toArrayBuffer()), Bridge._client.userId, {
                    onSuccess: function() {
                        RongIMClient._memoryStore.publicServiceMap.remove(publicServiceType, publicServiceId);
                        callback.onSuccess();
                    },
                    onError: function(code: ErrorCode) {
                        callback.onError(code);
                    }
                }, "MPFollowOutput");
            }
        }

        // #endregion Public Service

        // #region Blacklist
        /**
         * [加入黑名单]
         * @param  {string}            userId   [将被加入黑名单的用户Id]
         * @param  {OperationCallback} callback [返回值，函数回调]
         */
        addToBlacklist(userId: string, callback: OperationCallback) {
            CheckParam.getInstance().check(["string|number", "object"], "addToBlacklist", false, arguments);
            RongIMClient._dataAccessProvider.addToBlacklist(userId, callback);
        }
        /**
         * [获取黑名单列表]
         * @param  {GetBlacklistCallback} callback [返回值，函数回调]
         */
        getBlacklist(callback: GetBlacklistCallback) {
            CheckParam.getInstance().check(["object"], "getBlacklist", false, arguments);
            RongIMClient._dataAccessProvider.getBlacklist(callback);
        }
        /**
         * [得到指定人员再黑名单中的状态]
         * @param  {string}                          userId   [description]
         * @param  {ResultCallback<BlacklistStatus>} callback [返回值，函数回调]
         */
        //TODO 如果人员不在黑名单中，获取状态会出现异常
        getBlacklistStatus(userId: string, callback: ResultCallback<string>) {
            CheckParam.getInstance().check(["string|number", "object"], "getBlacklistStatus", false, arguments);
            RongIMClient._dataAccessProvider.getBlacklistStatus(userId, callback);
        }
        /**
         * [将指定用户移除黑名单]
         * @param  {string}            userId   [将被移除的用户Id]
         * @param  {OperationCallback} callback [返回值，函数回调]
         */
        removeFromBlacklist(userId: string, callback: OperationCallback) {
            CheckParam.getInstance().check(["string|number", "object"], "removeFromBlacklist", false, arguments);
            RongIMClient._dataAccessProvider.removeFromBlacklist(userId, callback);
        }

        getFileToken(fileType: FileType, callback: ResultCallback<string>) {
            CheckParam.getInstance().check(["number", "object"], "getQnTkn", false, arguments);
            RongIMClient._dataAccessProvider.getFileToken(fileType, callback);
        }

        getFileUrl(fileType: FileType, fileName: string, oriName: string, callback: ResultCallback<string>) {
            CheckParam.getInstance().check(["number", "string", "string|global|object|null", "object"], "getQnTkn", false, arguments);
            RongIMClient._dataAccessProvider.getFileUrl(fileType, fileName, oriName, callback);
        };
        // #endregion Blacklist

        // #region Real-time Location Service

        addRealTimeLocationListener(conversationType: ConversationType, targetId: string, listener: RealTimeLocationListener) {
            throw new Error("Not implemented yet");
        }

        getRealTimeLocation(conversationType: ConversationType, targetId: string) {
            throw new Error("Not implemented yet");
        }

        getRealTimeLocationCurrentState(conversationType: ConversationType, targetId: string) {
            throw new Error("Not implemented yet");
        }

        getRealTimeLocationParticipants(conversationType: ConversationType, targetId: string) {
            throw new Error("Not implemented yet");
        }

        joinRealTimeLocation(conversationType: ConversationType, targetId: string) {
            throw new Error("Not implemented yet");
        }

        quitRealTimeLocation(conversationType: ConversationType, targetId: string) {
            throw new Error("Not implemented yet");
        }

        startRealTimeLocation(conversationType: ConversationType, targetId: string) {
            throw new Error("Not implemented yet");
        }

        updateRealTimeLocationStatus(conversationType: ConversationType, targetId: string, latitude: number, longitude: number) {
            throw new Error("Not implemented yet");
        }

        // #endregion Real-time Location Service

        // # startVoIP
        startCall(converType: ConversationType, targetId: string, userIds: string[], mediaType: VoIPMediaType, extra: string, callback: ResultCallback<ErrorCode>) {
            CheckParam.getInstance().check(["number", "string|number", "array", "number", "string", "object"], "startCall", false, arguments);
            if (RongIMClient._memoryStore.voipStategy) {
                RongIMClient._voipProvider.startCall(converType, targetId, userIds, mediaType, extra, callback);
            } else {
                callback.onError(ErrorCode.VOIP_NOT_AVALIABLE);
            }
        }

        joinCall(mediaType: VoIPMediaType, callback: ResultCallback<ErrorCode>) {
            CheckParam.getInstance().check(['number', 'object'], "joinCall", false, arguments);
            if (RongIMClient._memoryStore.voipStategy) {
                RongIMClient._voipProvider.joinCall(mediaType, callback);
            } else {
                callback.onError(ErrorCode.VOIP_NOT_AVALIABLE);
            }
        }

        hungupCall(converType: ConversationType, targetId: string, reason: ErrorCode) {
            CheckParam.getInstance().check(["number", "string", "number"], "hungupCall", false, arguments);
            if (RongIMClient._memoryStore.voipStategy) {
                RongIMClient._voipProvider.hungupCall(converType, targetId, reason);
            }
        }

        changeMediaType(converType: ConversationType, targetId: string, mediaType: VoIPMediaType, callback: OperationCallback) {
            CheckParam.getInstance().check(["number", "string", "number", "object"], "changeMediaType", false, arguments);
            if (RongIMClient._memoryStore.voipStategy) {
                RongIMClient._voipProvider.changeMediaType(converType, targetId, mediaType, callback);
            } else {
                callback.onError(ErrorCode.VOIP_NOT_AVALIABLE);
            }
        }
        // # endVoIP

        getUnreadMentionedMessages(conversationType:ConversationType, targetId:string):any{
            return RongIMClient._dataAccessProvider.getUnreadMentionedMessages(conversationType, targetId);    
        }

        clearListeners():void{
            RongIMClient._dataAccessProvider.clearListeners();
        }

        // UserStatus start

        getUserStatus(userId:string, callback:ResultCallback<UserStatus>) : void{
            RongIMClient._dataAccessProvider.getUserStatus(userId,callback);
        }

        setUserStatus(status:number, callback:ResultCallback<boolean>) : void{
            RongIMClient._dataAccessProvider.setUserStatus(status,callback);
        }

        subscribeUserStatus(userIds:string[], callback:ResultCallback<boolean> ): void{
            RongIMClient._dataAccessProvider.subscribeUserStatus(userIds,callback);
        }

        setOnReceiveStatusListener(callback:Function) : void{
            RongIMClient._dataAccessProvider.setOnReceiveStatusListener(callback);
        }

        // UserStaus end

    }
}
