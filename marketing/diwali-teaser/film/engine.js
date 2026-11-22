/* QUOIN — Diwali teaser. WebGL2 render engine.
   Deterministic: nothing reads wall-clock. renderFrame(t) is the only entry. */
const VERT = `#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position=vec4(p*2.-1.,0,1); }`;

export class Engine {
  constructor(canvas){
    const gl = canvas.getContext('webgl2', {antialias:false, preserveDrawingBuffer:true});
    if(!gl) throw new Error('no webgl2');
    if(!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float fbo');
    this.gl = gl; this.W = canvas.width; this.H = canvas.height;
    this.programs = {}; this.fbos = {};
    // Scene buffers at full res, bloom chain at halves.
    this.fbos.a  = this.makeFBO(this.W, this.H);
    this.fbos.b  = this.makeFBO(this.W, this.H);
    this.fbos.mix= this.makeFBO(this.W, this.H);
    this.bw = this.W>>1; this.bh = this.H>>1;
    this.fbos.br  = this.makeFBO(this.bw, this.bh);
    this.fbos.bl1 = this.makeFBO(this.bw, this.bh);
    this.fbos.bl2 = this.makeFBO(this.bw, this.bh);
    this.qw = this.W>>2; this.qh = this.H>>2;
    this.fbos.q1 = this.makeFBO(this.qw, this.qh);
    this.fbos.q2 = this.makeFBO(this.qw, this.qh);
  }
  makeFBO(w,h){
    const gl=this.gl;
    const tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.HALF_FLOAT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const fb=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {tex,fb,w,h};
  }
  compile(name, frag){
    const gl=this.gl;
    const sh=(type,src)=>{
      const o=gl.createShader(type); gl.shaderSource(o,src); gl.compileShader(o);
      if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)){
        const log=gl.getShaderInfoLog(o);
        const line=(log.match(/0:(\d+)/)||[])[1];
        const ctx=line? src.split('\n').slice(Math.max(0,line-3),+line+2).join('\n') : '';
        throw new Error(`[${name}] ${log}\n--- near ---\n${ctx}`);
      }
      return o;
    };
    const p=gl.createProgram();
    gl.attachShader(p,sh(gl.VERTEX_SHADER,VERT));
    gl.attachShader(p,sh(gl.FRAGMENT_SHADER,frag));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(`[${name}] link: `+gl.getProgramInfoLog(p));
    this.programs[name]={p, loc:{}};
    return this.programs[name];
  }
  u(name,uni){
    const gl=this.gl, rec=this.programs[name];
    for(const k in uni){
      if(!(k in rec.loc)) rec.loc[k]=gl.getUniformLocation(rec.p,k);
      const l=rec.loc[k], v=uni[k];
      if(l===null) continue;
      if(typeof v==='number') gl.uniform1f(l,v);
      else if(v.length===2) gl.uniform2f(l,v[0],v[1]);
      else if(v.length===3) gl.uniform3f(l,v[0],v[1],v[2]);
      else if(v.length===4) gl.uniform4f(l,v[0],v[1],v[2],v[3]);
    }
  }
  /* Draw program `name` into FBO `target` (null = canvas). `tex` maps
     sampler uniform names to FBO records bound to successive units. */
  /* Uniform arrays: {NAME:{t:'4fv'|'2fv'|'1i', d:data}} */
  uArrays(name, arrays){
    const gl=this.gl, rec=this.programs[name];
    for(const k in arrays){
      const key=k+'[]';
      if(!(key in rec.loc)) rec.loc[key]=gl.getUniformLocation(rec.p, arrays[k].t==='1i'?k:k+'[0]');
      const l=rec.loc[key]; if(l===null) continue;
      const {t,d}=arrays[k];
      if(t==='4fv') gl.uniform4fv(l,d);
      else if(t==='2fv') gl.uniform2fv(l,d);
      else if(t==='1i') gl.uniform1i(l,d);
    }
  }
  pass(name, target, uni={}, tex={}, arrays=null){
    const gl=this.gl, rec=this.programs[name];
    const t = target? this.fbos[target] : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t? t.fb : null);
    const w = t? t.w : this.W, h = t? t.h : this.H;
    gl.viewport(0,0,w,h);
    gl.useProgram(rec.p);
    this.u(name, Object.assign({R:[w,h]}, uni));
    if(arrays) this.uArrays(name, arrays);
    let unit=0;
    for(const k in tex){
      gl.activeTexture(gl.TEXTURE0+unit);
      gl.bindTexture(gl.TEXTURE_2D, this.fbos[tex[k]].tex);
      if(!(k in rec.loc)) rec.loc[k]=gl.getUniformLocation(rec.p,k);
      if(rec.loc[k]!==null) gl.uniform1i(rec.loc[k], unit);
      unit++;
    }
    gl.drawArrays(gl.TRIANGLE_FAN,0,3);
  }
  finish(){ this.gl.finish(); }
}
