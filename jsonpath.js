// JSONPath 0.9.10 - XPath for JSON
// Copyright (c) 2020 Joel Bruner (https://github.com/brunerd)
// Copyright (c) 2020 "jpaquit" (https://github.com/jpaquit)
// Copyright (c) 2007 Stefan Goessner (goessner.net)
// Licensed under the MIT License

//Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

function jsonPath(obj, expr, arg) {
	var P = {
		//Possible resultType values:
			//VALUE - returns the actual value of the requested object
			//PATH - returns a string of the JSONPath(s) matched by the expression expr
			//PATH_DOTTED - JSONPath strings, except all key names are written in dot notation when possible
			//PATH_JSONPOINTER - returns a string in JSON Pointer format of the path(s) matched by the expression expr
		resultType: arg && arg.resultType || "VALUE",
		//singleQuoteKeys use with PATH and PATH_DOTTED to use single quotes for any quoted key names
		singleQuoteKeys: arg && arg.singleQuoteKeys || false,
		//escapeUnicode use with PATH and PATH_DOTTED to replace char codes \u0080-\uffff with \u Unicode escape sequences (\u001f and below are already escaped by default) 
		escapeUnicode: arg && arg.escapeUnicode || false,
		result: [],
		normalize: function(expr) {
		
			//work on strings only, pass through all others (like a pre-objectified path array)
			if (expr.constructor === null || expr.constructor !== String) { return expr }
			
			var pathStack=[]
			var baldRecursion=false
			var lastLastIndex=0;
			
			//trim any leading/trailing whitespace, reverse the string
			var revExpr=expr.replace(/^\s*/,"").replace(/\s*$/,"").split('').reverse().join('')

			//regex in reverse, to later be able to use negative lookahead assertions to quickly parse quotes strings containing escaped quotes
			//L1 structures: dotted keys, dotted star, opening bracket and $
			var Level1Regex = /([\w\d$]*[A-Za-z_$])(\.{1,2})|(\*?)(\.{1,2})|(\])|(\$)/g

			do {
				//run regex, get a match
				var L1Match = Level1Regex.exec(revExpr); 
				if(L1Match === null) { break }

				//check if there is a difference from the length of the L1Match , if not we are stuck
				if((lastLastIndex+L1Match[0].length) !== Level1Regex.lastIndex || L1Match[0] === "" ){
					throw new SyntaxError("Malformed path expression: " + expr)
				}
		
				//.key1 or ..key2 - ([\w\d$]*[A-Za-z_$])(\.{1,2})
				//.* or ..* - (\*?)(\.{1,2})
				if(L1Match[1] || L1Match[3]) {
					if(baldRecursion){throw new SyntaxError("Additional operators (./..) disallowed after recursive descent: " + expr)}
					//filter out nulls
					L1Match=L1Match.filter(function(p) { return p != null })

					if(L1Match[1] === '*') { pathStack.unshift({"expression":"*"}) }
					else if(L1Match[1]) { pathStack.unshift(L1Match[1].split('').reverse().join('')) }

					if (L1Match[2] === '..') { pathStack.unshift({"expression":".."}) }
					else if(L1Match[1] === '') { Level1Regex.lastIndex=lastLastIndex;  break }
				}
				//(\*?)(\.{1,2}) - just the dots ..
				else if(L1Match[4]) {							
					if(L1Match[4] === '.'){ break }
					else if(!pathStack.length){ baldRecursion=true; break }
					else if (pathStack[0].expression === "..") {
						throw new SyntaxError("Additional operators (./..) disallowed after recursive descent: " + expr)
					}
					pathStack.unshift({"expression":".."})
				}
				// (\]) - begin intra-bracket processing
				else if(L1Match[5]) {
					baldRecursion = false

					//L2 intra-bracket regex: quoted keys, star, number, dash, commas, colons, closed parens (begin), open bracket (end) and space
					var Level2Regex=/\s*(["'])(.*?)\1(?!\\)|(\*(?!:\*))|(\d+\-?)|(-)|(,)|(:)|(\))|(\[)|\s/g
					var subArray=[], L2Match=[], subLastLastIndex=Level1Regex.lastIndex, pendingData=[], intraSlice=false, needsDelimiter=false, isSlice=false;
					var openBracket=0, closedBracket=1;

					//set L2Regex to where we are in L1regex
					Level2Regex.lastIndex = Level1Regex.lastIndex				
					do {
						//get a L2Match match to the exec on revExpr
						L2Match=Level2Regex.exec(revExpr)
						//catch loops with lastIndex not advancing
						if (L2Match === null || subLastLastIndex === Level2Regex.lastIndex || subLastLastIndex + L2Match[0].length !== Level2Regex.lastIndex ) {
							throw new SyntaxError("Malformed path expression : " + expr)
						}
				
						//reverse things back
						L2Match = L2Match.map(function(s){return (!s ? s : s.split('').reverse().join(''))})
				
						//'key' or "key" - (["'])(.*?)\1(?!\\)
						if(L2Match[2] === ''){ subArray.unshift(L2Match[2]) }
						else if(L2Match[2]){
							if (needsDelimiter) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							if (intraSlice) { break }
							//un-reverse, unescape and put in array
							pendingData.unshift(L2Match[2].replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\n/g,'\n').replace(/\\b/g,'\b').replace(/\\f/g,'\f').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\u([0-9a-fA-F]{4})/g,function($0,$1){return String.fromCharCode(parseInt($1,16))}))
						}
						//* - (\*)
						else if(L2Match[3]){
							if (needsDelimiter) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							if (intraSlice) { break }
							else { pendingData.unshift({"expression":"*"}) }
						}
						//(\d+\-?) - integers positive or negative 
						else if(L2Match[4]){
							if (needsDelimiter && !isSlice) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							if (isSlice && intraSlice) { intraSlice=false }

							//eval in strict to catch octals, regex limits characters here, so eval is safe
							try {!eval(L2Match[4])} catch(e){throw new Error(e + ": " + L2Match[4])}
							//subArray.unshift(Number(L2Match[4]))
							pendingData.unshift(Number(L2Match[4]))
						}
						//(-) - from JSON Pointer, represents the index AFTER the last one, always non-existent
						else if(L2Match[5]){
							if (needsDelimiter) { Level2Regex.lastIndex=subLastLastIndex; break; } else { needsDelimiter=true }
							pendingData.unshift({"expression":"-"})
						}
						//(,) - time to write what we have and move on
						else if(L2Match[6]){

							//write any pending data we have
							if (pendingData.length && !isSlice){
								//pending is simply a number
								subArray.unshift(pendingData[0])
							}
							//tidy up slice array if we are moving on
							else if (pendingData.length){
								if(isSlice && intraSlice){ pendingData.unshift(null) }
								//slice expression (numbers and/or filter expression)
								subArray.unshift({"expression":pendingData})
							}
						
							//reset
							pendingData=[], needsDelimiter=false
							if (isSlice) { intraSlice=false; isSlice=false }
						}
						//(:) - colon (:)
						else if(L2Match[7]){
							isSlice=true

							// if we have something pending already, examine it
							// break if we have a ?() expression or a string or some other garbage...
							if (pendingData.length === 1 && pendingData[0] !== null && (pendingData[0].constructor === String || !(pendingData[0].constructor === Number || pendingData[0].expression[0] === "(" ))){
								break
							}
						
							//if nothing pending or we had previous colon, insert a colon to represent an empty slice slot ::
							if(!pendingData.length || intraSlice) { pendingData.unshift(null) } 
						
							//change state
							if (!intraSlice) { intraSlice=true }
						}

						//(\)) - closing parens, the beginning of our reverse regex
						else if(L2Match[8]){
							var openParens=0, closeParens=1, L3Match=[]

							//we will collect the entire ?()/() statement and then push in subArray
							var filterText=L2Match[8]

							//L3 regex: quoted strings, open parens, closed parens, ruby style regex (L), ruby style regex (R), equals sign, and arbitrary characters
							var Level3Regex=/(["'])(.*?)\1(?!\\)|(\()|(\))|(\/.*?\/(?!\\)\s*~=)|(~=\s*\/.*?\/(?!\\))|(==?((?:=|!)))|(.)/g
					
							if (isSlice) { intraSlice = false }
							else if (needsDelimiter) { break }
					
							//set our start point to be the same as where we are
							Level3Regex.lastIndex = Level2Regex.lastIndex
							do {
								//keep working on revExpr
								L3Match = Level3Regex.exec(revExpr)
						
								//(["'])(.*?)\1(?!\\) - quoted string
								//escape @ for substitution in P.eval
								if(L3Match[1]) { 
									filterText+=L3Match[0].replace(/@/g, "@\\")
								}				
								//(\() - open parens
								else if(L3Match[3]) {
									filterText+=L3Match[3]
									openParens += 1
								}
								//(\)) - close parens
								else if(L3Match[4]) {
									filterText+=L3Match[4]
									closeParens += 1
								}
								//(\/.*?\/(?!\\)\s*~=) - characters inside =~ /.../
								//(~=\s*\/.*?\/(?!\\)) - characters inside /.../ =~
								else if(L3Match[5]||L3Match[6]) { 
									//escape @ for escaping substitution in P.eval
									filterText+=L3Match[0].replace(/@/g, "@\\")
								}								
								//(==?((?:=|!))) - normalizes == and != to their strict equality equivalents
								else if(L3Match[7]) { 
									//rewrite to === or !== (reversed)
									filterText+="==" + L3Match[8]
								}
								//(.) - any other character
								else if(L3Match[9]) { 
									//if this is a = assignment (not != <= >=) break, =~ regex is matched earlier
									if(L3Match[9] === "=" && !/[<>!]/.test(revExpr[Level3Regex.lastIndex])) { 
										break
									}
									filterText+=L3Match[9]
								}

								if (closeParens === openParens){
									needsDelimiter=true
								
									//before we break check if the next char is a question mark and if so include that
									if(revExpr[Level3Regex.lastIndex] === '?'){
										if(isSlice){
											Level3Regex.lastIndex=0
											break
										}
										filterText+="?"
										Level3Regex.lastIndex = Level3Regex.lastIndex+1
									}
								
									//set our Level2Regex index to where we were in this
									Level2Regex.lastIndex = Level3Regex.lastIndex
									//reverse back to normal and store this in the array of items
									var filterTextFinal = filterText.split('').reverse().join('')							
									pendingData.unshift({"expression":filterTextFinal})
								
									break;
								}
							} while (Level3Regex.lastIndex !== 0 && Level3Regex.lastIndex !== revExpr.length)
						
							if (closeParens !== openParens) { break }
						}
						
						// (\[) - open bracket, the end of L2 for now
						else if(L2Match[9]){
					
							//empty brackets
							if(Level2Regex.lastIndex - Level1Regex.lastIndex === 1) {
								break
							} 
							else {
								Level1Regex.lastIndex = Level2Regex.lastIndex
								break									
							}
						}
						//\s* - spaces just advance on...

						//catch if we skip ahead or are stuck next match
						subLastLastIndex=Level2Regex.lastIndex					
					} while(Level2Regex.lastIndex !== 0 && Level2Regex.lastIndex !== revExpr.length )
					
					//if there is a pending number, write it
					if(pendingData.length === 1 && !isSlice) { subArray.unshift(pendingData[0]) }
					else if (pendingData.length){
						//for leading : insert a null
						if(isSlice && intraSlice){ pendingData.unshift(null) }
						//for cases with only one : make the last entry null
						if(pendingData[2] === undefined){ pendingData[2] = null }
						subArray.unshift({"expression":pendingData})
					}

					//put the whole array in the pathStack array, trace will handle unbundling
					if(subArray.length > 1){ pathStack.unshift(subArray) }
					//save trace some work with just a single non-array entry
					else { pathStack.unshift(subArray[0]) }
				}
				// (\$) - only valid at the beginning
				else if(L1Match[6]){
					//if it's at the end (beginning) it is the root designator
					if(Level1Regex.lastIndex === revExpr.length){ var hasRoot=true }
					else { break }
				}
				//to catch later if we skip ahead from a bad match or not...
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
			
			//create p, the path string representation
			for (var i=0,n=x.length; i<n; i++){
				
				if(P.resultType === "PATH_JSONPOINTER") {
					p += "/" + (x[i].constructor === Number ? x[i] : x[i].replace(/~/g,"~0").replace(/\//g,"~1"))
				}
				//else JSONPath string
				else {
					var pathString = x[i].constructor === Number ? "["+x[i]+"]" : (P.resultType === "PATH_DOTTED" && /^[A-Za-z_$][\w\d$]*$/.test(x[i]) ? "." + x[i] : ("["+ qt + (P.singleQuoteKeys ? x[i].replace(/'/g,"\\'") : x[i].replace(/"/g,'\\"')) + qt + "]").replace(/\n/g,'\\n').replace(/[\b]/g,'\\b').replace(/\f/g,'\\f').replace(/\r/g,'\\r').replace(/\t/g,'\\t').replace(/[\u0000-\u001f\u007f]/g, function(chr) {return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).slice(-4)}));					

					//escape Unicode characters \u style
					if (P.escapeUnicode){
						pathString = pathString.replace(/[\u007F-\uFFFF]/g, function(chr) { return "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).slice(-4) })
					}				
					p += pathString
				}
			}
			return p;
		},
		store: function(p, v) {

			if (p) { P.result[P.result.length] = /^PATH/.test(P.resultType) ? P.asPath(p) : v }
			return !!p;
		},
		trace: function(expr, val, path) {
			
			if(expr === false) return expr
			
			//if we have an expression
			if (expr.length) {

				var x = expr.slice()								
				var loc = x.shift();

				if (loc === false) { return loc }
				
				//if loc is negative and val is an array or string, resolve the negative index
				if(loc.constructor === Number && Math.sign(loc) === -1 && (val instanceof Array || val.constructor === String)) { 
					loc = (val.length+loc) 
				}
								
				//an array represents a union, it can store: strings (key names), numbers (array indices or numeric property names), and objects (expressions)
				//example: ["key",0,{"expression":"*"},{"expression":"?(@name =~ /key.*/)"}]
				if(Array.isArray(loc)){
					for (i=0; i<loc.length; i++) {
						var tx = x.slice()
						tx.unshift(loc[i])
						P.trace(tx, val, path)
					}
				}
				//{"expression":"..."} -  an singular object containing an expression key
				else if(loc.constructor === Object) {					
					//[0,1,null] - an array in an expression is a slice
					if(Array.isArray(loc.expression)){
						P.slice(loc.expression, x, val, path);
					}
					//* - star wildcard character
					else if (loc.expression === "*") {
						P.walk(loc.expression, x, val, path, function(m,l,x,v,p) { var tx = x.slice(); tx.unshift(m); P.trace(tx,v,p); });
					}					
					//.. recursive descent
					else if (loc.expression === "..") {
						P.trace(x, val, path);
						P.walk(loc, x, val, path, function(m,l,x,v,p) { var tx = x.slice(); tx.unshift({"expression":".."}); var tp = p.slice(); tp.push(m); typeof v[m] === "object" && P.trace(tx,v[m],tp); });
					}
					//(expr) - a script expression, the actual result is used as the key name
					else if (/^\(.*?\)$/.test(loc.expression))
					{
						var tx = x.slice();
						tx.unshift(P.eval(loc.expression, val, path[path.length-1]))
						P.trace(tx, val, path);
					}
					//- - dash operator, borrowed from JSON Pointer, represents the point AFTER the last array element
					//this is NOT needed for search but it is how the [-] expression would be resolved for a JSON Patch operation
					else if (/^-$/.test(loc.expression))
					{
						if(val !== null && Array.isArray(val)) {
							var tx = x.slice();
							tx.unshift(P.eval("(@.length)", val, path[path.length-1]))
							P.trace(tx, val, path);
						}
					}
					//?(expr) - a filter expression, this tests an expression and if true will descend into that key or return it's value
					else if (/^\?\(.*?\)$/.test(loc.expression)){
						P.walk(loc.expression, x, val, path, function(m,l,x,v,p) {
							if (P.eval(l.replace(/^\?\((.*?)\)$/,"$1"), v instanceof Array ? v[m] : v, m)) {
								var tx = x.slice(); tx.unshift(m); P.trace(tx,v,p);
							} 
						});
					}
				}					
				//else we are either a string or a number
				else if (val && val[loc] !== undefined) {
					var tpath = path.slice()
					//if this is an array, store loc as Number so it is NOT quoted in PATH or PATH_DOTTED output
					tpath.push(Array.isArray(val) ? Number(loc) : loc)
					P.trace(x, val[loc], tpath);
				}
			}
			//else no expr left, just store the results along with it's path
			else {
				P.store(path, val);
			}
		},
		//walk - used by * .. and ?() to interrogate the object
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
		//slice - same behavior as Python
		slice: function(loc, expr, val, path) {

			//now allows for string slicing
			if (val !== null && val.constructor === String) {
				val = val.split('')
				var isString=true
			} else { var isString=false }
			
			if (val instanceof Array) {
				var str="", len, start, end, step=1;
				
				//if the loc array has any undefined holes set them to null
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
				else{
					len=val.length, start=0, end=len
				}

				start=parseInt((loc[0] === null || loc[0].constructor === Number ? loc[0] : P.eval(loc[0].expression,val,path[path.length-1]))||((loc[0] === null || loc[0].constructor === Number ? loc[0] : P.eval(loc[0].expression,val,path[path.length-1])) === 0 ? 0 : start));
				end = (loc[1] === 0) ? 0 : parseInt((loc[1] === null || loc[1].constructor === Number ? loc[1] : P.eval(loc[1].expression,val,path[path.length-1]))||end)

				//adjust the bounds of the default depending on the value and the type of step in cases of negative values
				start = (start < 0) ? Math.max(Math.sign(step) === -1 ? -1 : 0,start+len) : Math.min(len,start);
				end = (end < 0) ? Math.max(Math.sign(step) === -1 ? -1 : 0,end+len) : Math.min(len,end);
				
				//if step is negative go the other way
				if(Math.sign(step) === -1){ var op=">" } else { var op="<" }
				
				//use eval to resolve op 
				for (var i=start; eval(i+op+end); i+=step){
					//strore arrays proper
					if(!isString){ 
						var texpr = expr.slice()
						texpr.unshift(i)
						P.trace(texpr, val, path);					
					}
					//collect characters into a string
					else{
						str += val[i] 
					}
				}
				//store combined sliced string along with this single path
				if(isString){ 
					P.store(path, str);
				}
    		}
		},
		eval: function(x, _v, _vname) {
			
			var tx = x.slice()
			
			//if this is a () expression, strip the outer parens
			if ((/^\(.*?\)$/).test(x)) { tx = tx.replace((/^\((.*?)\)$/),"$1") }
			
			//remove all all data between "" '' and //, split by semi-colon
			//remove all spaces before ( and collapse multiple spaces down to a single space
			var forbiddenInvocations=tx.split('').reverse().join('')
				.replace(/(["'])(.*?)\1(?!\\)/g, "")
				.replace(/(\/.*?\/(?!\\)\s*~=)|(=~*\s\/.*?\/(?!\\))/g, "")
				.replace(/\(\s*/g,"(").replace(/([;\.\+\-~\!\*\/\%\>\<\&\^\|\:\?\,])/g, " ")
				.replace(/\s+/g," ")
				//turn things back around and split on the space
				.split('').reverse().join('').split(' ')
				//anything that remains with ( that not at the beginning of a line and has character before it
				.filter(function(f){return (/\(/).test(f)})
				.filter(function(f){return (/[!^]\(|[\w\d_$]\(/).test(f)})			
				//only allow three functions tolerated
				.filter(function(f){return !((/test\(|exec\(|match\(/).test(f))})
			
			if(forbiddenInvocations.length){ throw new Error("Invocation violation: " + forbiddenInvocations) };
			
			try {
				var evalResult = eval(x.replace(/(^|[^\\])@/g, "$1_v")				
					.replace(/\\@/g, "@")
					//ruby regex handling from jpaquit
					//_v substitution on the left side
					.replace(/(_v(?:(?!(\|\||&&)).)*)=~((?:(?!\)* *(\|\||&&)).)*)/g, 
						function(match, p1, p2, p3, offset, currentString) {
							return match ? p3.trim()+'.test('+p1.trim()+')' : match
						}
					)
					//ruby regex with the _v substitution on the right side
					.replace(/((?:(?!\)* *(\|\||&&)).)*)\s+=~\s+(_v(?:(?!(\|\||&&)).)*)/g, 
						function(match, p1, p2, p3, offset, currentString) {
							return match ? p1.trim()+'.test('+p3.trim()+')' : match
						}
					)
				);
				
				//return false if falsey
				if(evalResult === undefined || evalResult === null || (evalResult.constructor === Number && Math.sign(evalResult) === -1) ) { 
					return false 
				}
				else {
					//we use floor in case of division, to ensure result is an integer
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

	//allows $ to be used in filter expressions
	var $ = obj;

	if (expr && obj !== undefined && (P.resultType == "VALUE" || /^PATH/.test(P.resultType))) {
		//normalize the JSONPath expression and send to trace along with the obj data and the beginning of the -p path output ["$"]
		P.trace(P.normalize(expr), obj, []);		
		
		//return P.result or an empty array
		return P.result.length ? P.result : [];
	}
}
