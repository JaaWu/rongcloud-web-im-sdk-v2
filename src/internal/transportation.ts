module RongIMLib {
    export interface Transportation {
        //创建通道
        createTransport(url: string, method: string): any;
        //传送消息流
        send(data: any, url?: string, method?: string): any;
        //接收服务器返回消息
        onData(data?: any): string;
        //处理通道关闭操作
        onClose(ev?:any): any;
        //通道异常操作
        onError(error: any): void;
        //断开连接
        disconnect(): void;

        close():void;
    }
}
