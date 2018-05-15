
class AXIS {
  static check(op,obj) {
    if (obj['soap:Fault']) {
      return obj;
    }
    let s = obj[op+'Response'];
    if (s) {
      let r = s[op+'Return'] || s['return'];
      return r || s;
    }
  }
}

class WSXML {

  static xsdType(t) {
    return t.startsWith('xsd:') ? t.substr(4) : null;
  }

  static jsType(t) {
    switch (t) {

      case 'anyType':
      case 'normalizedString':
      case 'base64Binary':
      case 'hexBinary':
      case 'dateTime':
      case 'QName':
      case 'token':
      case 'string': return 'string';

      case 'negativeInteger':
      case 'positiveInteger':
      case 'nonNegativeInteger':
      case 'nonPositiveInteger':
      case 'unsignedByte':
      case 'unsignedShort':
      case 'unsignedInt':
      case 'unsignedLong':
      case 'byte':
      case 'short':
      case 'int':
      case 'long':
      case 'integer': return 'integer';

      case 'float':
      case 'double':
      case 'decimal': return 'decimal';

      case 'boolean': return 'boolean';

      default: return undefined;
    }
  }

  static root(d,n) {
    if (d instanceof XMLDocument) {
      let e = d.documentElement;
      if (e.localName === n) return e;
    }
  }

  static child(e,n) {
    for (let c of e.children) {
      if (c.localName === n) return c;
    }
  }

  static localName(n) {
    if (n) return n.split(':').pop();
  }

} // WSXML

class WSAdapter {

  static getDefinition(url) {
    return new Promise((resolve,reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
            try {
              resolve(new WSDL(xhr.responseXML,url));
            }
            catch (error) {
              reject('getDefinition('+url+') rc=-1 '+error);
            }
          } else {
            reject('getDefinition('+url+') rc='+xhr.status+' '+xhr.statusText);
          }
        }
      };
      xhr.open('GET',url);
      xhr.send();
    });
  }

  static postMessage(ws,op,args,headers={SOAPAction:'""'}) {
    return new Promise((resolve,reject) => {
      const msg = this.request(ws,op,args);
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
            try {
              resolve(this.response(xhr.responseXML));
            }
            catch (error) {
              reject('postMessage('+ws.url+') rc=-1 '+error);
            }
          } else {
            reject('postMessage('+ws.url+') rc='+xhr.status+' '+xhr.statusText);
          }
        }
      };
      xhr.open('POST',ws.url);
      xhr.setRequestHeader('Content-Type','text/xml;charset=utf-8');
      for (let k in headers) {
        xhr.setRequestHeader(k,headers[k]);
      }
      xhr.send(msg);
    });
  }

  static request(ws,op,args) {
    let {elements,namespaces} = this.parameters(ws,op,args);
    return '<?xml version="1.0"?>'
      + '<soap:Envelope'
      + ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
      + ' soap:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
      + '<soap:Body'
      + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
      + ' xmlns:xsd="http://www.w3.org/2001/XMLSchema">'
      + '<p:'+op+' xmlns:p="'+ws.port+'"'
      +   namespaces + '>' + elements
      + '</p:'+op+'>'
      + '</soap:Body>'
      + '</soap:Envelope>';
  }

  static parameters(ws,op,args) {
    if (!isObject(args)) {
      throw 'bad parameters '+args;
    }
    let el = [], ns = [];
    marshal(signature(op),args);
    return {
      elements: el.join(''),
      namespaces: xmlns()
    };

    function marshal(a,v) {
      for (let [name,type] of a) {
        element(name,type,v[name]);
      }
    }

    function signature(o) {
      let p = ws.message(o);
      if (p && p.parameters) return p.parameters;
      throw 'unknown operation '+o;
    }
    function structure(t) {
      let p = ws.struct(t);
      if (p) return p;
      throw 'unknown complexType '+t;
    }

    function element(n,t,v) {
      let s = WSXML.xsdType(t);
      if (v === null || v === undefined) {
        switch (WSXML.jsType(s)) {
          case 'integer':
          case 'decimal': simple(n,t,0); break;
          case 'boolean': simple(n,t,false); break;
          default: nil(n,t); break;
        }
      } else {
        if (s) {
          simple(n,t,v);
        } else {
          t = t.split(':').pop();
          s = structure(t);
          if (s.arrayType) {
            array(n,s.arrayType,v);
          } else {
            complex(n,t,v,s);
          }
        }
      }
    }

    function array(n,t,v) {
      if (isObject(v)) throw 'not an array '+v;
      t = componentType(t);
      el.push('<'+n+' xsi:type="soap:Array" arrayType="'+t+'['+v.length+']">');
      for (let i = 0; i < v.length; i++) {
        element('item',t,v[i]);
      }
      el.push('</'+n+'>');
    }

    function complex(n,t,v,s) {
      if (!isObject(v)) throw 'not an object '+v;
      el.push('<'+n+' xsi:type="'+qname(t,s)+'">');
      marshal(s.sequence,v);
      el.push('</'+n+'>');
    }

    function simple(n,t,v) {
      el.push('<'+n+' xsi:type="'+t+'">'+v+'</'+n+'>');
    }

    function nil(n,t) {
      el.push('<'+n+' xsi:type="'+t+'" xsi:nil="true"/>');
    }

    function isObject(v) {
      if (Array.isArray(v)) {
        return false;
      } else {
        if (typeof v === 'object') {
          return true;
        } else {
          throw 'not an array or object '+v;
        }
      }
    }

    function componentType(t) {
      t = t.substr(0,t.length-2);
      if (!WSXML.xsdType(t)) {
        t = WSXML.localName(t);
        t = qname(t,structure(t));
      }
      return t;
    }

    function qname(t,s) {
      let i = ns.indexOf(s.tns);
      if (i < 0) {
        i = ns.length;
        ns.push(s.tns);
      }
      return 't'+i+':'+t;
    }
    function xmlns() {
      let x = '';
      for (let i = 0; i < ns.length; i++) {
        x += ' xmlns:t'+i+'="'+ns[i]+'"';
      }
      return x;
    }

  } // parameters()

  static response(xml) {
    let e = WSXML.root(xml,'Envelope');
    if (e) {
      e = WSXML.child(e,'Body');
      if (e) {
        let [n,v] = this.result(e);
        if ('Fault' === n) {
          return {['soap:'+n]:v};
        } else {
          return {[n]:v};
        }
      }
    }
    throw 'not a SOAP message '+xml;
  }

  static result(body) {
    return unmarshal(body.firstElementChild); // or search for output message name

    function unmarshal(e) {
      let n = e.localName;
      let r = dereference(e);
      let v = r.firstElementChild ? complex(r) : simple(r);
      return [n,v];
    }

    function simple(e) {
      if (attribute(e,'nil') === 'true') {
        return null;
      } else {
        let t = attribute(e,'type')  ;
        return textOf(e,WSXML.localName(t));
      }
    }

    function textOf(e,t) {
      switch (WSXML.jsType(t)) {
        case 'integer': return parseInt(e.textContent);
        case 'decimal': return parseFloat(e.textContent);
        case 'boolean': return e.textContent === 'true';
        default: return e.textContent;
      }
    }

    function complex(e) {
      return attribute(e,'arrayType') ? array(e) : struct(e);
    }

    function array(e) {
      let a = [];
      for (let c of e.children) {
        let [,v] = unmarshal(c);
        a.push(v);
      }
      return a;
    }

    function struct(e) {
      let o = new Object();
      for (let c of e.children) {
        let [n,v] = unmarshal(c);
        o[n] = v;
      }
      return o;
    }

    function dereference(e) {
      let h = e.getAttribute('href');
      return h ? e.ownerDocument.querySelector('[id="'+h.substr(1)+'"]') : e;
    }

    function attribute(e,n) {
      let m = e.attributes;
      for (let i = 0; i < m.length; i++) {
        let a = m.item(i);
        if (a.localName === n) return a.value;
      }
    }

  } // result

} // WSAdapter

class WSDL {

  constructor(xml) {
    if (!WSXML.root(xml,'definitions')) {
      throw "not a WSDL "+xml;
    }

    this.$xml = xml;
    this.$url = location();
    this.$pn = portname();
    this.$op = new Map();
    this.$ct = new Map();

    function portname() {
      let e = xml.querySelector('definitions service port[name]');
      return e ? e.getAttribute('name') : null;
    }
    function location() {
      let e = xml.querySelector('definitions service port address[location]');
      return e ? e.getAttribute('location') : null;
    }
  }

  get port() { return this.$pn; }

  get url() { return this.$url; }
  set url(url) { this.$url = url; }

  struct(ct) { return this.$ct.get(ct); }
  message(op) { return this.$op.get(op); }

  getProxy() {
    let a = Array.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
    let b = this.operations(...a);
    for (let op in b) {
      let args = this.names(b[op].parameters);
      b[op] = new Function(args,'return this.rpc("'+op+'",{'+args+'});').bind(this);
    }
    return b;
  }

  rpc(op,args) { return WSAdapter.postMessage(this,op,args); }

  names(a) {
    let s = [];
    for (let [n] of a) s.push(n);
    return s.join(',');
  }

  findIt(name,map,make,made) {
    let o = map.get(name);
    if (!o) {
      o = make.call(this,name);
      if (o) {
        map.set(name,o);
        if (made) {
          made.call(this,o);
        }
      }
    }
    return o;
  }

  operations(...a) {
    let m = new Object();
    for (let name of a) {
      let o = this.findOperation(name);
      if (o) {
        m[name] = o;
        this.findNestedTypes({sequence:o.parameters});
      }
    }
    return m;
  }

  findOperation(name) {
    return this.findIt(name,this.$op,this.getOperation);
  }

  getOperation(operation) {
    let part, name, type;
    let parameters = [];

    let op = this.$xml.querySelector('portType operation[name='+operation+']');
    if (!op) return null;

    name = op.querySelector('input').getAttribute('name');
    let input = this.$xml.querySelector('definitions message[name='+name+']');

    name = op.querySelector('output').getAttribute('name');
    let output = this.$xml.querySelector('definitions message[name='+name+']');

    let names = op.getAttribute('parameterOrder');
    if (names) {
      for (name of names.split(' ')) {
        let s = 'part[name='+name+']';
        part = input.querySelector(s);
        if (part) {
          type = part.getAttribute('type');
          parameters.push([name,type]);
        }
      }
    }

    name = output.getAttribute('name');
    part = output.firstElementChild;
    type = part ? part.getAttribute('type') : null;

    return {name,type,parameters};
  }

  complexTypes(...a) {
    for (let name of a) this.findComplexType(name);
  }

  findComplexType(name) {
    name = this.simpleName(name);
    return this.findIt(name,this.$ct,this.getComplexType,this.findNestedTypes);
  }

  findNestedTypes(t) {
    if (t.sequence) {
      for (let [,type] of t.sequence) {
        if (!WSXML.xsdType(type)) {
          this.findComplexType(type);
        }
      }
    } else {
      if (t.arrayType) {
        this.findComplexType(t.arrayType);
      }
    }
  }

  getComplexType(name) {
    name = this.simpleName(name);
    let ct = this.$xml.querySelector('complexType[name='+name+']');
    if (ct) {
      let tns = ct.parentElement.getAttribute('targetNamespace');

      let seq = ct.querySelector('sequence');
      if (seq) {
        let sequence = this.elements(seq);
        return {tns,sequence};
      } else {
        let art = ct.querySelector('attribute');
        if (art) {
          let arrayType = this.attribute(art,'arrayType');
          return {tns,arrayType};
        }
      }
    }
  }

  elements(sequence) {
    let a = [];
    for (let e = sequence.firstElementChild; e; e = e.nextElementSibling) {
      let n = e.getAttribute('name');
      let t = e.getAttribute('type');
      a.push([n,t]);
    }
    return a;
  }

  attribute(e,n) {
    let c = e.getAttributeNames();
    for (let k of c) {
      if (( k.includes(':') ? k.endsWith(n) : (k === n) )) {
        return e.getAttribute(k);
      }
    }
  }

  simpleName(n) {
    let ns = n.split(':');
    if (ns.length > 1) n = ns.pop();
    if (n.endsWith('[]')) n = n.substr(0,n.length-2);
    return n;
  }

} // WSDL
