// Stand-in for Studio's Python side, so the window can be tested in a plain browser.
// A small grey test picture (any image works).
const img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAGklEQVR4nGNoaGhgIAUwkaR6VMOohqGlAQBPwgF/b2d7tgAAAABJRU5ErkJggg==";
function mock(ready) {
  return `
  window.__img = ${JSON.stringify(img)};
  (function(){
    var info = {path:"C:/x/interior_v4.png", name:"interior_v4.png", w:1800, h:1004, preview: window.__img};
    var files = [
      {key:"klein",part:"create",tier:"best",label:"FLUX.2 Klein 9B",about:"The image model. Needs a free Hugging Face account to download.",gb:9.4,ready:${ready},file:"flux-2-klein-9b-fp8mixed.safetensors",can_download:false,page:"https://huggingface.co/x",optional:false},
      {key:"qwen",part:"create",tier:"best",label:"Qwen 3 8B text encoder",about:"Reads your prompt.",gb:8.7,ready:${ready},file:"qwen_3_8b_fp8mixed.safetensors",can_download:true,page:"",optional:false},
      {key:"klein4b",part:"create",tier:"good",label:"Image model",about:"",gb:4,ready:false,file:"x",can_download:true,page:"",optional:false},{key:"qwen4b",part:"create",tier:"good",label:"Prompt reader",about:"",gb:8,ready:false,file:"y",can_download:true,page:"",optional:false},
      {key:"vae2",part:"create",label:"FLUX.2 VAE",about:"Turns pictures into the model's format and back.",gb:0.3,ready:true,file:"flux2-vae.safetensors",can_download:true,page:"",optional:false},
      {key:"consistency",part:"create",label:"Klein-consistency",about:"Keeps your design when Keep my design is up.",gb:0.3,ready:true,file:"Klein-consistency.safetensors",can_download:false,page:"",optional:true},
      {key:"flux1",part:"juice",label:"Flux.1 dev",about:"Adds atmosphere.",gb:23.8,ready:true,file:"flux1-dev.safetensors",can_download:false,page:"https://x",optional:false},
      {key:"t5",part:"juice",label:"T5 text encoder",about:"Reads the prompt for Flux.1.",gb:4.9,ready:true,file:"t5.safetensors",can_download:true,page:"",optional:false},
      {key:"clipl",part:"juice",label:"CLIP-L",about:"",gb:0.25,ready:true,file:"clip_l.safetensors",can_download:true,page:"",optional:false},
      {key:"vae1",part:"juice",label:"Flux.1 VAE",about:"",gb:0.3,ready:false,file:"ae.safetensors",can_download:true,page:"",optional:false}];
    var status = {files:files, create_ready:${ready}, juice_ready:true, engine_installed:${ready}, home:"C:\\\\Users\\\\Pranay\\\\Documents\\\\Vistiq Studio",
      comfy_models:"C:\\\\Users\\\\DFMNH\\\\Downloads\\\\ComfyUI-Easy-Install\\\\ComfyUI\\\\models",
      loras:[{name:"Klein-consistency.safetensors",label:"Design lock",family:"klein9b",gb:0.33},{name:"a.safetensors",label:"Automotive Interior Rendering Detail Atmosphere",family:"flux1",gb:0.6},{name:"b.safetensors",label:"Flux detailer",family:"flux1",gb:0.6},{name:"look.safetensors",label:"Clay render",family:"klein9b",gb:0.3},{name:"UnrealVisionXL.safetensors",family:"sdxl",gb:6.6}],
      tier:${ready}?"best":"", chosen:"", tiers:{best:{label:"Best quality",ready:${ready}},good:{label:"Good quality",ready:false}}, select_ready:false, helper_ready:true, times:{per:62,load:40,warm:false}, sizes:{recommended:4096,allowed:4096,why:"16 GB memory"}, mac:{chip:"Apple M3",ram:16,can_generate:true,max_side:4096}, apps:{photoshop:true,affinity:false}, engine:{state:"idle",message:""}, busy:false, setup_running:false, free_gb:312};
    var P = function(v){ return Promise.resolve(v); };
    window.pywebview = { api: {
      init: function(){ return P({version:"0.1.0", flavor:"studio", settings:{scale:"2",model:"auto",format:"PNG",two_pass:true,out_dir:"C:/out",max_res:7000,comfy_path:"",keep_engine:true}, engine:{state:"ready",message:"",models:[]}, items:[], notice:"", update:{state:"ready",latest:"0.1.2",current:"0.1.1"}, models:{catalog:null,engine_models:[],download:null}}); },
      studio_status: function(){ return P(status); }, studio_drop_target: function(){ return P(); },
      studio_library: function(){ var a=[]; ["create","reference","upscale","create","create","upscale"].forEach(function(k,i){a.push({path:"p"+i,name:"Vistiq_interior_v4_"+k+"_v"+(i+1)+".png",kind:k,thumb:window.__img,text:"red seats"});}); return P(a); },
      studio_pick: function(){ return P(info); }, studio_get_select: function(){ return P(true); }, studio_live: function(on,app){ return P({on:on}); }, studio_install_panel: function(){ return P({ok:true,message:"Installed. Restart Photoshop, then open Window → Plugins → Vistiq Studio."}); }, check_updates: function(){ return P(true); }, studio_set_tier: function(t){ status.chosen=t; return P(status); }, studio_select: function(p,pts,w,h){ var c=document.createElement("canvas"); c.width=w;c.height=h; var x=c.getContext("2d"); x.fillStyle="#8A2BF2"; x.beginPath(); x.ellipse(pts[0][0]*w,pts[0][1]*h,w*0.12,h*0.18,0,0,7); x.fill(); return P({mask:c.toDataURL()}); }, engine_state: function(){ return P({engine:{state:"ready",message:""}}); },
      estimates: function(){ return P({}); }
    }};
    window.__info = info;
  })();`;
}

module.exports = { mock, img };
