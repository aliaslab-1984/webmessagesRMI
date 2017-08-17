# webmessagesRMI
Library enabling RMI like interaction across window/iframe of a webpage using webmessages

# Description

The library exposes the global variable **wmRMI**, which is the unique entrypoint of the library and allows to subscribe to library produced events, connect to a "remote" window, disconnect from a window.

Here the exposed interface:

- **eventHook():DOMElement**: gets an object (DOMElement) usable to subcribe to library produced events
- **connect(wnd[, origin="\*"]):promise-like**: starts the connection to another window (_wnd_) providing its origin. Returns a promise-like object. The resolution callback will have the connection object as its first argument.
- **disconnect(obj):void**: disconnects the library invalidating all produced object wrapper. _obj_ can be a connection object or a window object.
- **on(obj, eventName, callback)**: adds the event handler _callback_ of _eventName_ from the object _obj_. The object must be a DOMElement or an object with an _eventHook()_ methods which returns a DOMElement.
- **off(obj, eventName, callback)**: removes the event handler _callback_ of _eventName_ from the object _obj_.

# Usage

Here are a usage example of an iframe coomunicating with its parent window.
Every page loads the jquery library and the webmessageRMI library.

Main window:
<pre>
	$(wmRMI.eventHook()).on("connected",function(res){
		var wmRMI = res.detail.wmRMI;
		window.x = wmRMI;
		var a={};
		var b={};
		wmRMI.bind("a",a);
		wmRMI.bind("b",b);
		
		wmRMI.rmiCall("root","listBoundObjects")
		.done(function(data){
			console.log(data);
		});

		window.wmRMI.on(wmRMI,"object-bound", function(name){
			//args:c
			console.log("event [object-bound]: args:"+name);
			
			wmRMI.getWrappedObject("c")
			.done(function(p){
				p.mt1_sync(10).join(function(res){
					//res.value===16
					console.log(res.value);
				});
				
				$(p.eventHook()).on("test", function(e){
					//event [c::test]: args:3,"valore"
					console.log("event [c::test]: args:"+e.detail.arguments);
				});
				//same as
				window.wmRMI.on(p,"test", function(a,b){
					//event [c::test]: args:3,"valore"
					console.log("event [c::test]: args:"+a+","+b);
				});
			})
			.fail(function(e){
				console.log(e);
			});
		});
	});

</pre>

IFrame window:
<pre>
	var c={
		val:3,
		mt1:function(){
			return this.val;
		},
		mt2:function(val){
			return this.val*2+val;
		},
		obj:{}
	};
	
	wmRMI.connect(window.parent,"*")
	.done(function(wmRMI){
		console.log("connected");
		
		wmRMI.bind("c",c);
		
		wmRMI.rmiCall("root","listBoundObjects")
		.done(function(data){
			console.log(data);
		});

		setTimeout(function(){
			wmRMI.rmiTriggerEvent("c","test", 3, "valore");
		},2000);
	});
</pre>

The IFrame window inits the connection while the main window listen to connection notifications.
After the connection has been established, both sides register some local objects for remote expositions and query the remote peer to get a list o exposed objects.

After that the main window get a wrapper object of the "c" object exsposed by the IFrame and calls its mt2_\_sync_ method variant.

# API

### connection object

Through the connection object is possible to expose local objects to remote call, perform remote call on remote objects, get o trigger remote events from or to the remote peer, get information on the currently exposed objects and get wrappers of remote objects exsposed by the linked peer.

Here the exposed interface:

- **eventHook():DOMElement**: gets an object (DOMElement) usable to subcribe to remote events
- **triggerEvent(eventName[,...]):void**: trigger a remote event of type _eventName_. Every further argument will be passed in the event detail.
- **bind(objName, obj):void**: expose a local object to remote invaocation by _objName_ name. The connection object is always exposed with the **"root"** name. The event **object-bound** with the object binding name is triggered.
- **unbind(objName):void**: revokes the local by _objName_ identified object exposition. The event **object-unbound** with the object binding name is triggered.
- **rmiCall(objName,mtName[,...]):promise-like**: invokes the method named _mtName_ on the remote _objName_ named object. Every further argument will be passed as an argument of the remote method. Return a promise-like object. The resolution callback will have the method result as its first argument. 
- **listBoundObjects():array**: gets an array of remotely exposed object names.
- **listBoundObjectMethods(objName):array**: gets an array of method names exposed by _objName_.
- **getWrappedObject(objName):promise-like**: produce an object wrapper of the remote _objName_. Returns a promise-like object the resolve callback of which will have the wrapper object as its first argument.
- **dispose():void**: Destroys the connection object and triggers the "disposed" remote event, destroying its remote peer.
- **isDisposed():bool**: Returns true if the objects has been disposed.
- **isConnected():bool**: Returns true if the connection hand-shake has benn concluded.

### wrapper object

The wrapper object is an object with all the methods exposed by the remote object and for each one a copy with the suffix __sync_.

The normal methods will return a promise-like object, the same as the one returned by the method _rmiCall_.

The _\*\_sync_ methods will return an object with the following interface:
- **hasValue():bool**: returns true if the object has a _value_ property.
- **value:object**: the result of the invocation. The value is meaningfull and set only when the _hasValue()_ method returns true.
- **join(callback):void**: register a callback to be called at the setting of the _value_ attribute at the conclusion of the remote method invocation. The object will be passed as the first argument of the callback.

The object has also a **eventHook()** method which exposes the hook on which remote events from the paired window will be triggered and can be listened to.

### promise-like object

The "prmise-like object" is an object that resembles the interface of a jquery promise. On it is possible to call the chianable methods:

- **done(callabck):self**
- **fail(callback):self**
- **always(callback):self**
- **then(resolve, reject):promise-like**

### call context object

The call context object is attached to the exposed methods during a remote call setting the funcion attribute **\_\_wmRMI_ctx**.

The object is used to singal the outcome to the remote calling peer.

Here the exposed interface:

- **call(obj, mt, args):object**: starts a controlled execution of the method _mt_ on the object _obj_ with the arguments in the_args_ array.
- **resolve(result):void**: signal the successfull conclusion of the invocation, sending _result_ as the outcome.
- **reject(error):void**: signal the unsuccessfull conclusion of the invocation, sending _error_ as the outcome.

# Exposing an object

Every object can be exposed. The unique limitations are those imposed by the HTML5 webmessages specification: every exchanged object must be _Transferrable_.

It's possibe to influence the behaviour of the exposed methods and their visbility, decorating the function object with the attribute **\_\_wmRMI_attributes**.

Setting the attribute **notpublic=true** of the **\_\_wmRMI_attributes** object hides the method from the remote peer insepction and invocation.
Setting the attribute **async=true** of the **\_\_wmRMI_attributes** object blocks the automatic call of the _callContext.resolve()_ method, enabling the asynchronous managing of the call.

The asynchronous managing can also be enforced by the method itself. Every remotely called method will have the attribute **\_wmRMI_ctx** set with the current callContext object. Setting the attribute **\_wmRMI_ctx.async=true**, blocks the automatic resolve call and allows the caller to handle result signlaing.