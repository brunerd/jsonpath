// JSONPath 0.9.15 (no comments) - XPath for JSON
// Copyright (c) 2021 Joel Bruner (https://github.com/brunerd)
// Copyright (c) 2020 "jpaquit" (https://github.com/jpaquit)
// Copyright (c) 2007 Stefan Goessner (goessner.net)
// Licensed under the MIT License

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

function jsonPath(obj, expr, arg) {
	var P = {
		resultType: arg && arg.resultType || "VALUE",
		singleQuoteKeys: arg && arg.singleQuoteKeys || false,
		escapeUnicode: arg && arg.escapeUnicode || false,
		result: [],
		normalize: function(expr) {

			if (expr.constructor === null || expr.constructor !== String) { return expr }

			var pathStack=[]
			var baldRecursion=false
			var lastLastIndex=0;

			var revExpr=expr.replace(/^\s*/,"").replace(/\s*$/,"").split('').reverse().join('')

			var Level1Regex = /([\w\d$]*[A-Za-z_$])(\.{1,2})|(\*?)(\.{1,2})|(\])|(\$)/g

			do {
				var L1Match = Level1Regex.exec(revExpr); 
				if(L1Match === null) { break }

				if((lastLastIndex+L1Match[0].length) !== Level1Regex.lastIndex || L1Match[0] === "" ){
					throw new SyntaxError("Malformed path expression: " + expr)
				}

				if(L1Match[1] || L1Match[3]) {
					if(baldRecursion){throw new SyntaxError("Additional operators (./..) disallowed after recursive descent: " + expr)}
					L1Match=L1Match.filter(function(p) { return p != null })

					if(L1Match[1] === '*') { pathStack.unshift({"expression":"*"}) }
					else if(L1Match[1]) { pathStack.unshift(L1Match[1].split('').reverse().join('')) }

					if (L1Match[2] === '..') { pathStack.unshift({"expression":".."}) }
					else if(L1Match[1] === '') { Level1Regex.lastIndex=lastLastIndex;  break }
				}
				else if(L1Match[4]) {
					if(L1Match[4] === '.'){ break }
					else if(!pathStack.length){ baldRecursion=true; break }
					else if (pathStack[0].expression === "..") {
						throw new SyntaxError("Additional operators (./..) disallowed after recursive descent: " + expr)
					}
					pathStack.unshift({"expression":".."})
				}
				else if(L1Match[5]) {
					baldRecursion = false

					var Level2Regex=/\s*(["'])(.*?)\1(?!\\)|(\*(?!:\*))|(\d+\-?)|(-)|(,)|(:)|(\))|(\[)|\s/g
					var subArray=[], L2Match=[], subLastLastIndex=Level1Regex.lastIndex, pendingData=[], intraSlice=false, needsDelimiter=false, isSlice=false;
					var openBracket=0, closedBracket=1;

					Level2Regex.lastIndex = Level1Regex.lastIndex
					do {
						L2Match=Level2Regex.exec(revExpr)
						if (L2Match === null || subLastLastIndex === Level2Regex.lastIndex || subLastLastIndex + L2Match[0].length !== Level2Regex.lastIndex ) {
							throw new SyntaxError("Malformed path expression : " + expr)
						}

						L2Match = L2Match.map(function(s){return (!s ? s : s.split('').reverse().join(''))})

						if(L2Match[2] === ''){ subArray.unshift(L2Match[2]) }
						else if(L2Match[2]){
							if (needsDelimiter) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							if (intraSlice) { break }
							pendingData.unshift(JSON.parse('"'+(L2Match[1] === "'" ? L2Match[2].replace(/\\'/g,"'").replace(/\"/g,"\\\"") : L2Match[2])+'"',null,0))
						}
						else if(L2Match[3]){
							if (needsDelimiter) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							if (intraSlice) { break }
							else { pendingData.unshift({"expression":"*"}) }
						}
						else if(L2Match[4]){
							if (needsDelimiter && !isSlice) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							if (isSlice && intraSlice) { intraSlice=false }

							if (L2Match[4] !== "0" && (L2Match[4][0] === "0" || (L2Match[4][0] === "-" && L2Match[4][1] === "0"))){
								throw new Error("Octal indices are disallowed: " + L2Match[4])
							}
							else{
								pendingData.unshift(Number(L2Match[4]))
							}
						}
						else if(L2Match[5]){
							if (needsDelimiter) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							pendingData.unshift({"expression":"-"})
						}
						else if(L2Match[6]){

							if (pendingData.length && !isSlice){
								subArray.unshift(pendingData[0])
							}
							else if (pendingData.length){
								if(isSlice && intraSlice){ pendingData.unshift(null) }
								subArray.unshift({"expression":pendingData})
							}

							pendingData=[], needsDelimiter=false
							if (isSlice) { intraSlice=false; isSlice=false }
						}
						else if(L2Match[7]){
							isSlice=true

							if (pendingData.length === 1 && pendingData[0] !== null && (pendingData[0].constructor === String || !(pendingData[0].constructor === Number || pendingData[0].expression[0] === "(" ))){
								break
							}

							if(!pendingData.length || intraSlice) { pendingData.unshift(null) } 

							if (!intraSlice) { intraSlice=true }
						}

						else if(L2Match[8]){
							var openParens=0, closeParens=1, L3Match=[]

							var filterText=L2Match[8]

							var Level3Regex=/(["'])(.*?)\1(?!\\)|(\()|(\))|(\/.*?\/(?!\\)\s*~=)|(~=\s*\/.*?\/(?!\\))|(==?((?:=|!)))|(.)/g

							if (isSlice) { intraSlice = false }
							else if (needsDelimiter) { break }

							Level3Regex.lastIndex = Level2Regex.lastIndex
							do {
								L3Match = Level3Regex.exec(revExpr)

								if(L3Match[1]) { 
									filterText+=L3Match[0].replace(/@/g, "@\\")
								}
								else if(L3Match[3]) {
									filterText+=L3Match[3]
									openParens += 1
								}
								else if(L3Match[4]) {
									filterText+=L3Match[4]
									closeParens += 1
								}
								else if(L3Match[5]||L3Match[6]) { 
									filterText+=L3Match[0].replace(/@/g, "@\\")
								}
								else if(L3Match[7]) { 
									filterText+="==" + L3Match[8]
								}
								else if(L3Match[9]) { 
									if(L3Match[9] === "=" && !/[<>!]/.test(revExpr[Level3Regex.lastIndex])) { 
										break
									}
									filterText+=L3Match[9]
								}

								if (closeParens === openParens){
									needsDelimiter=true

									if(revExpr[Level3Regex.lastIndex] === '?'){
										if(isSlice){
											Level3Regex.lastIndex=0
											break
										}
										filterText+="?"
										Level3Regex.lastIndex = Level3Regex.lastIndex+1
									}

									Level2Regex.lastIndex = Level3Regex.lastIndex
									var filterTextFinal = filterText.split('').reverse().join('')
									pendingData.unshift({"expression":filterTextFinal})

									break;
								}
							} while (Level3Regex.lastIndex !== 0 && Level3Regex.lastIndex !== revExpr.length)

							if (closeParens !== openParens) { break }
						}

						else if(L2Match[9]){

							if(Level2Regex.lastIndex - Level1Regex.lastIndex === 1) {
								break
							} 
							else {
								Level1Regex.lastIndex = Level2Regex.lastIndex
								break
							}
						}

						subLastLastIndex=Level2Regex.lastIndex
					} while(Level2Regex.lastIndex !== 0 && Level2Regex.lastIndex !== revExpr.length )

					if(pendingData.length === 1 && !isSlice) { subArray.unshift(pendingData[0]) }
					else if (pendingData.length){
						if(isSlice && intraSlice){ pendingData.unshift(null) }
						if(pendingData[2] === undefined){ pendingData[2] = null }
						subArray.unshift({"expression":pendingData})
					}

					if(subArray.length > 1){ pathStack.unshift(subArray) }
					else { pathStack.unshift(subArray[0]) }
				}
				else if(L1Match[6]){
					if(Level1Regex.lastIndex === revExpr.length){ var hasRoot=true }
					else { break }
				}
				lastLastIndex=Level1Regex.lastIndex
			} while(Level1Regex.lastIndex !== 0 && Level1Regex.lastIndex !== revExpr.length )

			if (!hasRoot || baldRecursion || Level1Regex.lastIndex !== revExpr.length) { throw new SyntaxError("Malformed path expression: " + expr) }

			return pathStack
		},
		asPath: function(path) {
			if(P.resultType === "PATH_OBJECT"){ return {"path":path} }

			var qt = P.singleQuoteKeys ? "'" : '"';
			var p=(P.resultType === "PATH_JSONPOINTER" ? "" : "$");
			var x = path.slice()

			for (var i=0,n=x.length; i<n; i++){

				if(P.resultType === "PATH_JSONPOINTER") {
					p += "/" + (x[i].constructor === Number ? x[i] : x[i].replace(/~/g,"~0").replace(/\//g,"~1"))
				}
				else {
					p += x[i].constructor === Number ? "["+x[i]+"]" : (P.resultType === "PATH_DOTTED" && /^[A-Za-z_$][\w\d$]*$/.test(x[i]) ? "." + x[i] : ("["+ qt + x[i].replace((P.escapeUnicode ? /[\u0000-\u001f\u007f-\uffff|\\|"|']/g : /[\u0000-\u001f\u007f|\\|"|']/g), function(chr) { switch(chr) { case '\b': return "\\b"; case '\f': return "\\f"; case '\n': return "\\n"; case '\r': return "\\r"; case '\t': return "\\t";case '\\': return "\\\\";case '"': return (P.singleQuoteKeys ? "\"" : "\\\"" );case '\'': return (P.singleQuoteKeys ? "\\'" : "'" );default: return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).slice(-4);}}) + qt + "]"));
				}
			}
			return p;
		},
		store: function(p, v) {
			if (P.escapeUnicode && v !== null && v.constructor === String){
				v = v.replace(/[\u007F-\uFFFF]/g, function(chr) { return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).slice(-4) })
			}

			if (p) { P.result[P.result.length] = /^PATH/.test(P.resultType) ? P.asPath(p) : v }
			return !!p;
		},
		trace: function(expr, val, path) {

			if(expr === false) return expr

			if (expr.length) {

				var x = expr.slice()
				var loc = x.shift();

				if(val !== null && Array.isArray(val) && loc.constructor === String && loc.match(/^0/) && loc !== "0"){
					throw new Error("Property name '"+ loc +"' is a string with leading zeros and target is an array!")
				}
				
				if(loc.constructor === Number && Math.sign(loc) === -1 && (val instanceof Array || val.constructor === String)) { 
					loc = (val.length+loc) 
				}

				if(Array.isArray(loc)){
					for (i=0; i<loc.length; i++) {
						var tx = x.slice()
						tx.unshift(loc[i])
						P.trace(tx, val, path)
					}
				}
				else if(loc.constructor === Object) {
					if(Array.isArray(loc.expression)){
						P.slice(loc.expression, x, val, path);
					}
					else if (loc.expression === "*") {
						P.walk(loc.expression, x, val, path, function(m,l,x,v,p) { var tx = x.slice(); tx.unshift(m); P.trace(tx,v,p); });
					}
					else if (loc.expression === "..") {
						P.trace(x, val, path);
						P.walk(loc, x, val, path, function(m,l,x,v,p) { var tx = x.slice(); tx.unshift({"expression":".."}); var tp = p.slice(); tp.push(m); typeof v[m] === "object" && P.trace(tx,v[m],tp); });
					}
					else if (/^\(.*?\)$/.test(loc.expression))
					{
						var tx = x.slice();
						tx.unshift(P.eval(loc.expression, val, path[path.length-1]))
						P.trace(tx, val, path);
					}
					else if (/^-$/.test(loc.expression))
					{
						if(val !== null && Array.isArray(val)) {
							var tx = x.slice();
							tx.unshift(P.eval("(@.length)", val, path[path.length-1]))
							P.trace(tx, val, path);
						}
					}
					else if (/^\?\(.*?\)$/.test(loc.expression)){
						P.walk(loc.expression, x, val, path, function(m,l,x,v,p) {
							if (P.eval(l.replace(/^\?\((.*?)\)$/,"$1"), v instanceof Array ? v[m] : v, m)) {
								var tx = x.slice(); tx.unshift(m); P.trace(tx,v,p);
							} 
						});
					}
				}
				else if (val && val.constructor !== String && val[loc] !== undefined) {
					var tpath = path.slice()
					tpath.push(Array.isArray(val) ? Number(loc) : loc)
					P.trace(x, val[loc], tpath);
				}
			}
			else {
				P.store(path, val);
			}
		},
		walk: function(loc, expr, val, path, f) {
			if (val instanceof Array) {
				for (var i=0,n=val.length; i<n; i++) {
					if (i in val) {
						f(i,loc,expr,val,path);
					}
				}
			}
			else if (typeof val === "object") {
				for (var m in val) {
					if (val.hasOwnProperty(m)) {
 						f(m,loc,expr,val,path);
					}
				}
			}
		},
		slice: function(loc, expr, val, path) {
			if (val instanceof Array) {
				var str="", len, start, end, step=1;
				loc[0]=loc[0] !== undefined ? loc[0] : null; loc[1]=loc[1] !== undefined ? loc[1] : null; loc[2]=loc[2] !== undefined ? loc[2] : null

				if ((loc[2] === null || loc[2].constructor === Number ? loc[2] : P.eval(loc[2].expression,val,path[path.length-1])) === 0) { 
					throw new RangeError("Slice step cannot be zero: [" + loc.join(":") + "]") 
				}
				else { 
					step=parseInt((loc[2] === null || loc[2].constructor === Number ? loc[2] : P.eval(loc[2].expression,val,path[path.length-1]))||step)
				}

				if(Math.sign(step) === -1){
					len=val.length, start=len-1, end=(len+(loc[1] === null ? 1 : 0))*(-1)
				}
				else {
					len=val.length, start=0, end=len
				}

				start = parseInt((loc[0] === null || loc[0].constructor === Number ? loc[0] : P.eval(loc[0].expression,val,path[path.length-1]))||((loc[0] === null || loc[0].constructor === Number ? loc[0] : P.eval(loc[0].expression,val,path[path.length-1])) === 0 ? 0 : start));
				end = (loc[1] === 0) ? 0 : parseInt((loc[1] === null || loc[1].constructor === Number ? loc[1] : P.eval(loc[1].expression,val,path[path.length-1]))||end)

				start = (start < 0) ? Math.max(Math.sign(step) === -1 ? -1 : 0,start+len) : Math.min(len,start);
				end = (end < 0) ? Math.max(Math.sign(step) === -1 ? -1 : 0,end+len) : Math.min(len,end);

				if(Math.sign(step) === -1){ var op=">" } else { var op="<" }

				for (var i=start; eval(i+op+end); i+=step){
					var texpr = expr.slice()
					texpr.unshift(i)
					P.trace(texpr, val, path);
				}
    		}
		},
		eval: function(x, _v, _vname) {

			var tx = x.slice()

			if ((/^\(.*?\)$/).test(x)) { tx = tx.replace((/^\((.*?)\)$/),"$1") }

			var forbiddenInvocations=tx.split('').reverse().join('')
				.replace(/(["'])(.*?)\1(?!\\)/g, "")
				.replace(/(\/.*?\/(?!\\)\s*~=)|(=~*\s\/.*?\/(?!\\))/g, "")
				.replace(/\(\s*/g,"(").replace(/([;\.\+\-~\!\*\/\%\>\<\&\^\|\:\?\,])/g, " ")
				.replace(/\s+/g," ")
				.split('').reverse().join('').split(' ')
				.filter(function(f){return (/\(/).test(f)})
				.filter(function(f){return (/[!^]\(|[\w\d_$]\(/).test(f)})
				.filter(function(f){return !((/test\(|exec\(|match\(/).test(f))})

			if(forbiddenInvocations.length){ throw new Error("Invocation violation: " + forbiddenInvocations) };

			try {
				var evalResult = eval(x.replace(/(^|[^\\])@/g, "$1_v")
					.replace(/\\@/g, "@")
					.replace(/(_v(?:(?!(\|\||&&)).)*)=~((?:(?!\)* *(\|\||&&)).)*)/g, 
						function(match, p1, p2, p3, offset, currentString) {
							return match ? p3.trim()+'.test('+p1.trim()+')' : match
						}
					)
					.replace(/((?:(?!\)* *(\|\||&&)).)*)\s+=~\s+(_v(?:(?!(\|\||&&)).)*)/g, 
						function(match, p1, p2, p3, offset, currentString) {
							return match ? p1.trim()+'.test('+p3.trim()+')' : match
						}
					)
				);

				if(evalResult === undefined || evalResult === null || (evalResult.constructor === Number && Math.sign(evalResult) === -1) ) { 
					return false 
				}
				else {
					return evalResult.constructor === Number ? Math.floor(evalResult) : evalResult
				}
			}
			catch(e) { 
				throw new SyntaxError("eval: " + e.message + ": " + x.replace(/(^|[^\\])@/g, "$1_v")
					.replace(/\\@/g, "@") /* issue 7 : resolved .. */
					/* 2020/01/09 - manage regexp syntax "=~" */
					.replace(/(_v(?:(?!(\|\||&&)).)*)=~((?:(?!\)* *(\|\||&&)).)*)/g, 
						function(match, p1, p2, p3, offset, currentString) { 
							return match ? p3.trim()+'.test('+p1.trim()+')' : match
						}
					) 
					.replace(/((?:(?!\)* *(\|\||&&)).)*)\s+=~\s+(_v(?:(?!(\|\||&&)).)*)/g, 
						function(match, p1, p2, p3, offset, currentString) { 
							return match ? p3.trim()+'.test('+p1.trim()+')' : match
						}
					)
				)
			}
		}
	};

	var $ = obj;

	if (expr && obj !== undefined && (P.resultType == "VALUE" || /^PATH/.test(P.resultType))) {
		P.trace(P.normalize(expr), obj, []);

		return P.result.length ? P.result : [];
	}
}
