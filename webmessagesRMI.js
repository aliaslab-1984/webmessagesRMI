(function(){
	function isFunction(functionToCheck) {
		var getType = {};
		return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
	};
	
	function uniqueId(){
		return Date.now().toString() + "-" + Math.floor(Math.random()*1000000000).toString();
	};
	
	function sanitizeOrigin(origin){
		if(!origin || /^https?:\/\/.+$|^\*$/.test(origin)==false)
			return null;
		else
			return origin;
	}
	
	(function () {

	  if ( typeof window.CustomEvent === "function" ) return false;

	  function CustomEvent ( event, params ) {
		params = params || { bubbles: false, cancelable: false, detail: undefined };
		var evt = document.createEvent( 'CustomEvent' );
		evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
		return evt;
	   }

	  CustomEvent.prototype = window.Event.prototype;

	  window.CustomEvent = CustomEvent;
	})();
	
	
	var deferred = function(){
		var that = this;
		
		var _done;
		var _fail;
		var _always;
		
		var _resolved = false;
		var _rejected = false;
		
		that.resolve = function(){
			if(_resolved || _rejected)
				return;
			
			_resolved = {args:arguments};
			
			if(_done)
				return _done.apply(that, arguments);
			if(_always)
				_always.apply(that, arguments);
		};
		that.reject = function(){
			if(_resolved || _rejected)
				return;
			
			_rejected = {args:arguments};
			
			if(_fail)
				return _fail.apply(that, arguments);
			if(_always)
				_always.apply(that, arguments);
		};
		
		that.promise = function(){
			return {
				done:function(cb){
					_done = cb; 
					if(_resolved) 
						cb.apply(that,_resolved.args);
					return this;
				},
				fail:function(cb){
					_fail = cb; 
					if(_rejected) 
						cb.apply(that, _rejected.args);
					return this;
				},
				always:function(cb){
					_always = cb;
					if(_resolved) 
						cb.apply(that,_resolved.args);
					if(_rejected) 
						cb.apply(that, _rejected.args);
					return this;
				},
				then:function(resolve, reject){
					reject = reject || function(){};
					
					var d = new deferred();
					
					var _rs = that.resolve;
					that.resolve=function(){
						_rs.apply(that, arguments);
						var r = resolve.apply(that, arguments);
						d.resolve.call(d,r);
					};
					var _rj = that.reject;
					that.reject=function(){
						_rj.apply(that, arguments);
						var r = reject.apply(that, arguments);
						d.reject.call(d,r);
					};
					
					return d.promise();
				}
			};
		};
	}
	
	var callCtx = function(_wmRMIId, callId, source, origin){
		var that = this;
		
		var _method = null;
		
		origin = sanitizeOrigin(origin);
		origin = origin || "*";
		
		that.reject= function(msg){
			if(msg instanceof DOMException)
				msg = {code:msg.code,message:msg.message,name:msg.name, objString:msg.toString()};
			source.postMessage({_wmRMIId:_wmRMIId, type:"response", callId:callId, success:false, error:msg}, origin);
			if(_method)
				delete _method.__wmRMI_ctx;
		};
				
		that.resolve = function(result){
			source.postMessage({_wmRMIId:_wmRMIId, type:"response", callId:callId, success:true, result:result}, origin);
			if(_method)
				delete _method.__wmRMI_ctx; 
		};
		
		that.call = function(obj, mt, args){
			if(mt.__wmRMI_ctx)
				that.reject("nested call not allowed");
			mt.__wmRMI_ctx = that;
			
			if(mt.__wmRMI_attributes)
				that.async = mt.__wmRMI_attributes.async || false;
			
			_method = mt;
			
			var result = undefined;
			try {
				result = mt.apply(obj, args || []);
			}
			catch(e){
				that.error = e;
			}
			return result;
		}
	};
	
	/*
	event.data: {_wmRMIId:0,type:"request",callId:0, objectName:"", methodName:"", arguments:[]}
	event.data: {_wmRMIId:0,type:"response",callId:0, success:true|false, result:{}, error:""}
	event.data: {_wmRMIId:0,type:"protocol", name:"", step:""}
	event.data: {_wmRMIId:0,type:"event", eventName:"", detail:""}
	*/
	
	var wmRMIctor = function (id, wnd, origin){
		var that = this;
		
		var _wmRMIId = id;
		var _eventHook = document.createElement("div");
				
		var _boundObjs = {};
		var _pendingReqs = {};
		
		var _disposed = false;
		var _connectedWindow = wnd;
		
		origin = sanitizeOrigin(origin);
		var _connectedOrigin = origin || "*";
		var connectedWindow = function(){
			if(_disposed)
				throw "object disposed";
			return _connectedWindow;
		}
		var connectedOrigin = function(){
			if(_disposed)
				throw "object disposed";
			return _connectedOrigin;
		}
				
		that.bind = function(objName, obj){	
			if(_disposed)
				throw "object disposed";		
			_boundObjs[objName] = obj;
			that.triggerEvent("object-bound", objName);
		};
		that.bind.__wmRMI_attributes={notpublic:true}
		
		that.unbind = function(objName){
			if(_disposed)
				throw "object disposed";			
			delete _boundObjs[objName];
			that.triggerEvent("object-unbound", objName);
		}
		that.unbind.__wmRMI_attributes={notpublic:true}
		
		that.rmiCall=function(objName, mtName){
			if(_disposed)
				throw "object disposed";
			var d = new deferred();
			
			var args = Array.prototype.slice.call(arguments,2);
			var callId = uniqueId();
			_pendingReqs[callId]=d;
			
			connectedWindow().postMessage({_wmRMIId:_wmRMIId, type:"request", callId:callId, objectName:objName, methodName:mtName, arguments:args}, connectedOrigin());
			
			return d.promise();
		};
		that.rmiCall.__wmRMI_attributes={notpublic:true}
		
		that.triggerEvent=function(eventName){
			if(_disposed)
				throw "object disposed";
			if(!connectedWindow())
				return;
			var args = Array.prototype.slice.call(arguments,1);
						
			connectedWindow().postMessage({_wmRMIId:_wmRMIId, type:"event", eventName:eventName, detail:args}, connectedOrigin());
		};
		that.rmiTriggerEvent=function(objName, eventName){
			if(_disposed)
				throw "object disposed";
			if(!connectedWindow())
				return;
			var args = Array.prototype.slice.call(arguments,2);
			
			args.unshift(eventName);
			
			connectedWindow().postMessage({_wmRMIId:_wmRMIId, type:"event", eventName:"::"+objName+"::", detail:args}, connectedOrigin());
		};
				
		var _notify = function(data){
			if(_pendingReqs[data.callId]===undefined)
				throw "response for unknown request. callId:'"+data.callId+"'";
			
			if(data.success && _pendingReqs[data.callId].resolve)
				_pendingReqs[data.callId].resolve(data.result);
			if(!data.success && _pendingReqs[data.callId].reject)
				_pendingReqs[data.callId].reject(data.error);
			
			delete _pendingReqs[data.callId];
		};

		///////			
		that.eventHook = function(){
			return _eventHook;
		};
		that.eventHook.__wmRMI_attributes={notpublic:true}
		
		that.isConnected=function(){
			return connectedWindow()||false;
		};
		
		that.getWrappedObject=function(objName){
			if(_disposed)
				throw "object disposed";
			var d = new deferred();
			that.rmiCall("root","listBoundObjectMethodNames",objName)
			.done(function(ms){
				var t = {};
				
				var _wrapperDisposed=false;
				
				for(var i=0;i<ms.length;i++){
					if(ms[i] == "eventHook")
						continue;
					
					t[ms[i]] = (function(m){
						return function(){
							if(_wrapperDisposed)
								throw "The wrapper id disposed";
							var args = Array.prototype.slice.call(arguments);
							args.unshift(m);
							args.unshift(objName);
							return that.rmiCall.apply(that,args);
						}
					})(ms[i]);
					
					t[ms[i]+"_sync"] = (function(m){
						return function(){
							if(_wrapperDisposed)
								throw "The wrapper id disposed";
							var args = Array.prototype.slice.call(arguments);
							args.unshift(m);
							args.unshift(objName);
							
							var _join = null;
							var s={
								join:function(cb){
									_join = cb || function(){};
								},
								hasValue:function(){
									return this.value!==undefined;
								}
							};
							that.rmiCall.apply(that,args)
							.done(function(data){
								s.value=data===undefined?null:data;
								_join && _join.call(s,s);
							})
							.fail(function(data){
								delete s.value;
								_join && _join.call(s,s,data);
							});
							
							return s;
						}
					})(ms[i]);
				}
				
				t.isDisposed=function(){
					return _disposed;
				};
				
				var _eventHook = document.createElement("div");
				t.eventHook = function()
				{
					return _eventHook;
				};
				var tmpFunc;
				that.eventHook().addEventListener("::"+objName+"::", tmpFunc = function(evt){
					_eventHook.dispatchEvent(new CustomEvent(evt.detail.arguments[0], { detail : { arguments: Array.prototype.slice.call(evt.detail.arguments,1), originalEvent:evt } }));
				});
				
				t.dispose = function(){
					_wrapperDisposed = true;
					that.eventHook().removeEventListener("::"+objName+"::",tmpFunc,false);
				};
				
				d.resolve(t);
			})
			.fail(function(err){ d.reject(err);});
			
			return d.promise();
		};
		that.getWrappedObject.__wmRMI_attributes={notpublic:true}
		
		that.listBoundObjects = function(){
			return Object.keys(_boundObjs);
		};
		that.listBoundObjectMethodNames = function(objName){
			var b_obj = _boundObjs[objName];
			if(b_obj===undefined)
				throw "no bound object '"+objName+"' found";
			
			var ms = [];
			var ks = Object.keys(b_obj);			
			for(var i=0;i<ks.length;i++){
				if(isFunction(b_obj[ks[i]]) && (!b_obj[ks[i]].__wmRMI_attributes || !b_obj[ks[i]].__wmRMI_attributes.notpublic ))
					ms.push(ks[i]);
			}
			
			return ms;
		};
				
		that.bind("root", that);
		
		var listener;
		window.addEventListener("message", listener = function(evt){			
			if(evt.data.type===undefined || evt.data._wmRMIId!==_wmRMIId)
				return;
			evt.data.originalEvent = evt;
			
			if(evt.data.type=="request"){
				var ctx = new callCtx(evt.data._wmRMIId, evt.data.callId, evt.source, evt.origin);
				
				try {
					var b_obj = _boundObjs[evt.data.objectName];
					if(b_obj===undefined)
						throw "no bound object '"+evt.data.objectName+"' found";
					
					var b_method = _boundObjs[evt.data.objectName][evt.data.methodName];
					if(b_method===undefined || (b_method.__wmRMI_attributes && b_method.__wmRMI_attributes.notpublic))
						throw "no method '"+evt.data.methodName+"' found on bound object '"+evt.data.objectName+"'";
									
					var result = ctx.call(b_obj, b_method, evt.data.arguments);
					if(ctx.error)
						ctx.reject(ctx.error);
					else if(!ctx.async)
						ctx.resolve(result);
				}
				catch(e){
					ctx.reject(e);
				}
			}
			else if(evt.data.type=="response"){
				_notify(evt.data);
			}
			else if(evt.data.type=="event"){
				_eventHook.dispatchEvent(new CustomEvent(evt.data.eventName, { detail : { arguments: evt.data.detail, originalEvent:evt }}));
			}
		}, false);
			
		that.isDisposed=function(){
			return _disposed;
		};
	
		that.dispose = function(){
			that.triggerEvent("disposed");
						
			window.removeEventListener("message", listener,false);
			
			_connectedWindow = null;
			_connectedOrigin = null;
			
			_disposed=true;
		};
		that.eventHook().addEventListener("disposed",function(){that.dispose();},false);
	};
	
	window.wmRMI = new wmRMIctor();
	window.wmRMI = new (function(){
		var that = this;
				
		_connectedWindows=[];
		
		var indexOfWnd = function(obj){
			for(var i=0;i<_connectedWindows.length;i++)
				if(_connectedWindows[i].wnd===obj || _connectedWindows[i].wmRMI===obj)
					return i;
			return -1;
		};
		
		that.on=function(el,eventName,handler){
			if(el.eventHook && isFunction(el.eventHook))
				el = el.eventHook();
			el.addEventListener(eventName, handler.__listener = function(evt){
				handler.apply(el, evt.detail.arguments);
			});
		}
		that.off=function(el,eventName,handler){
			if(el.eventHook && isFunction(el.eventHook))
				el = el.eventHook();
			el.removeEventListener(eventName, handler.__listener,false);
		}
		
		that.connect=function(wnd, origin){			
			var d = new deferred();
			var idx = indexOfWnd(wnd);
			if(idx==-1){
				var id = uniqueId();
				_protocols["connect"].pending[id] = d;
				_protocols["connect"].steps.init(id, wnd, origin);
			}
			else {
				d.resolve(_connectedWindows[idx]);
			}
			return d.promise();
		};
		that.disconnect=function(obj){
			var idx = indexOfWnd(obj)
			if(idx!=-1){
				_connectedWindows[i].wmRMI.dispose();
				_connectedWindows.splice(i,1);
			}
		};
			
		var _eventHook = document.createElement("div");
		that.eventHook = function(){
			return _eventHook;
		};
			
		var _protocols ={
			connect:{
				pending:{},
				steps:{
					init:function(id, wnd, origin){
						origin = sanitizeOrigin(origin);
						wnd.postMessage({type:"protocol",name:"connect",step:"init", args:{_wmRMIId:id}}, origin||"*");
					},
					complete:function(id, source, origin, obj){		
						origin = sanitizeOrigin(origin);				
						source.postMessage({type:"protocol",name:"connect",step:"complete", args:{_wmRMIId:id}}, origin||"*");
						
						_eventHook.dispatchEvent(new CustomEvent("connected",{detail:{wmRMI:obj}}));
					}
				},
				manage:function(data){
					if(data.step=="init"){						
						var cn = new wmRMIctor(data.originalEvent.data.args._wmRMIId, data.originalEvent.source, data.originalEvent.origin);
						_connectedWindows.push(cn);
						
						this.steps.complete(data.originalEvent.data.args._wmRMIId, data.originalEvent.source, data.originalEvent.origin, cn);
					}
					if(data.step=="complete"){			
						var cn = new wmRMIctor(data.originalEvent.data.args._wmRMIId, data.originalEvent.source, data.originalEvent.origin);
						_connectedWindows.push(cn);
						
						this.pending[data.originalEvent.data.args._wmRMIId].resolve(cn);
						delete this.pending[data.originalEvent.data.args._wmRMIId];
						
						_eventHook.dispatchEvent(new CustomEvent("connected",{detail:{wmRMI:cn}}));
					}
				}
			}			
		};
		
		window.addEventListener("message", function(evt){			
			if(evt.data.type===undefined || evt.data._wmRMIId!==undefined)
				return;
			evt.data.originalEvent = evt;
			
			if(evt.data.type=="protocol"){
				if(_protocols[evt.data.name]===undefined)
					throw "unknown protocol '"+evt.data.name+"'";
				
				_protocols[evt.data.name].manage(evt.data);
			}
		}, false);
	});
})();