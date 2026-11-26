// LG CAMERA (model label scanner) address. Change it here only.
// For local tests, ?camera=http://localhost:4173 overrides it. Only loopback addresses are accepted.
const LG_CAMERA_URL='https://lg-camera-lab.pages.dev';
(() => {
  'use strict';
  const M=DotScene, $=id=>document.getElementById(id);
  const cv=$('scene'), view=$('view'), drawer=$('drawer'), ctx=cv.getContext('2d');
  // Keep layout in phone CSS pixels even when Chrome scales down the entire preview.
  let previewScale=1;
  function fitPhone(){
    previewScale=Math.min(1,innerWidth/document.body.offsetWidth,innerHeight/document.body.offsetHeight);
    document.documentElement.style.setProperty('--preview-scale',String(previewScale));
  }
  fitPhone();window.addEventListener('resize',fitPhone);
  const cats=['가전','가구','소품','바닥','벽','구조'];
  const myDrawerOrder=new Map(['catalog:fridge:M876GBC472','catalog:robot:R560BL1','catalog:stick:A727TA','catalog:fridge:B315DS11','catalog:fridge:S836MDS002'].map((key,i)=>[key,i]));
  const hist={A:[],B:[],C:[]};
  let room='B', tone='pink', layouts={}, next=1, cat='가전', selected=null, overlap=[];
  let woodRooms=new Set();
  let life=null;
  const online=location.protocol!=="file:";
  const requestedSpace=new URLSearchParams(location.search).get('space');
  const space=online&&['menu','example','my'].includes(requestedSpace)?requestedSpace:'dream';
  const readOnly=space==='menu'||space==='example';
  const compareWashers=space==='example'&&new URLSearchParams(location.search).get('compare')==='washers';
  const params=new URLSearchParams(location.search);
  const liveDream=online&&space==='dream';
  const legacyRetroKey='lg-miniroom.dot.dream.retro-c';
  let cDisplayVersion=0;
  // Fronts along the two back walls, shorter silhouettes toward the viewer.
  // Legacy keys identify the old exhibition slots during migration only.
  const displaySlots=[
    ['wash_b','catalog:dryer:RD20WNR',2,34,1],
    ['wash_s','catalog:washer:WA2525EGP6R',2,11,1],
    ['fridge_pb','catalog:fridge:M876GBC472',68,1,0],
    ['standbyme','catalog:tv:27LX6TPGA',36,55,1],
    ['vacuum','catalog:stick:A727TA',99,20,0]
  ];
  const washerShelf=new URLSearchParams(location.search).get('shelf')==='2'?2:1;
  let storeKey=online&&space==="my"?"lg-miniroom.dot.my":"dotroom";
  const layoutVersion=1;
  const backupKey=()=>storeKey+'.before-wood';
  let ordered=[],displayed=[], storageOK=true, noticeTimer, ready=false;
  const list=()=>layouts[room], id=()=>next++;
  const camera={zoom:1,k:1,x:0,y:0,left:0,top:0};
  const bounds={A:[12,8,410,346],B:[12,8,404,313],C:[12,8,400,327]};
  function notice(text){
    clearTimeout(noticeTimer);$('notice').textContent=text;
    noticeTimer=setTimeout(()=>$('notice').textContent='',3600);
  }
  function valid(raw){
    if(!raw||!raw.layouts||typeof raw.layouts!=='object'||Array.isArray(raw.layouts))return false;
    for(const group of Object.values(raw.layouts)){
      if(Array.isArray(group))group.forEach(ProductCatalog.migratePlacement);
    }
    if(raw.room!=null&&!Object.hasOwn(M.names,raw.room))return false;
    if(raw.theme!=null&&!['pink','lime'].includes(raw.theme))return false;
    if(raw.woodRooms!=null&&(!Array.isArray(raw.woodRooms)||!raw.woodRooms.every(r=>Object.hasOwn(M.names,r))))return false;
    return Object.keys(M.names).every(r=>raw.layouts[r]==null||
      (Array.isArray(raw.layouts[r])&&raw.layouts[r].every(o=>o&&Number.isSafeInteger(o.id)&&
      !!ProductCatalog.restore(M.products,o.k)&&Number.isFinite(o.x)&&Number.isFinite(o.y)&&
      (o.routineIds==null||(Array.isArray(o.routineIds)&&o.routineIds.every(key=>typeof key==='string')))&&
      [0,1,false,true].includes(o.f)&&(o.turn==null||([0,1,2,3].includes(o.turn)&&o.turn%2===Number(o.f)))&&(o.e==null||Number.isFinite(o.e)))));
  }
  function restore(raw){
    cDisplayVersion=raw?.cDisplayVersion||0;
    room=raw?.room||(compareWashers?'A':'B');tone=raw?.theme||'pink';layouts=raw?.layouts||{};
    woodRooms=new Set(raw?.woodRooms||[]);
    next=1;
    for(const r of Object.keys(M.names))for(const o of layouts[r]||[]){next=Math.max(next,o.id+1);o.e??=0}
    for(const r of Object.keys(M.names))layouts[r]??=defaultLayout(r);
    if(space==='my')for(const items of Object.values(layouts)){
      // Existing movie routines were reachable through the sofa before individual links existed.
      const first=items.find(o=>o.k==='sofa');
      for(const o of items)if(o.k==='sofa')o.routineIds??=o===first?['movie-night']:[];
    }
    // Older starter arrangements only had a mirror bit. Preserve custom placements.
    for(const [r,items] of Object.entries(layouts)){
      if(!Array.isArray(items))continue;
      const my=space==='my',sy=my?55:56,ty=my?49:56;
      if(!my&&r!=='B')continue;
      const couch=items.find(o=>o.k==='sofa'&&o.x===34&&o.y===sy&&o.f===1&&o.e===0&&o.turn==null);
      const tv=items.some(o=>o.k==='tvset'&&o.x===(my?1:0)&&o.y===ty&&o.f===1);
      if(couch&&tv)couch.turn=1;
    }
  }
  function cleanLayouts(){
    if(!online)return;
    for(const r of Object.keys(M.names)){
      layouts[r]=layouts[r].filter(o=>{
        if(M.products[o.k]?.c!=='가전'||ProductCatalog.hasModel(o.k))return true;
        const replacement=life?.registeredReplacement(o);
        if(!replacement)return false;
        o.k=replacement;return true;
      });
    }
  }
  function defaultLayout(r){
    woodRooms.add(r);
    if(liveDream&&r==='C')return makeDisplay();
    if(compareWashers&&r==='A'){
      const start=(washerShelf-1)*5;
      return DOT_ASSETS.items.filter(p=>p.washerStyle&&ProductCatalog.hasModel(p.k)).slice(start,start+5)
        .map((p,i)=>({id:id(),k:p.k,x:12+22*i,y:7,f:0,e:0}));
    }
    const [x,y]=r==='B'?[34,48]:r==='A'?[46,26]:[44,32];
    const sofa={id:id(),k:'sofa',x,y,f:1,e:0,turn:1};
    if(space==='my')sofa.routineIds=['movie-night'];
    return [sofa];
  }
  function makeDisplay(){
    const items=displaySlots.filter(([,k])=>ProductCatalog.hasModel(k)).map(([,k,x,y,f])=>{
      const product=ProductCatalog.restore(M.products,k);
      return {id:id(),k,x,y,f,e:0,exhibit:true,...(product.previousFootprint?{artVersion:1}:{})};
    });
    addDisplayPurifiers(items);addDisplayDehumidifier(items);return items;
  }
  function addDisplayPurifiers(items){
    const positions=[[45,55],[53,48],[71,50],[78,29]];
    return ProductCatalog.purifierModels.map((model,i)=>
      placeExhibit(items,'catalog:purifier:'+model,positions[i],true)).every(Boolean);
  }
  function addDisplayDehumidifier(items){
    return placeExhibit(items,'catalog:dehumid:DQ203PCCA',[90,52],false);
  }
  function placeExhibit(items,k,[x,y],versioned){
    if(!ProductCatalog.hasModel(k))return true;
    const profile=ProductCatalog.restore(M.products,k);
    if(items.some(o=>o.k===k&&(!versioned||o.artVersion)))return true;
    const o={id:id(),k,x,y,f:0,turn:0,e:0,exhibit:true};
    if(versioned)o.artVersion=1;
    if(M.placementBlocker(o,items)){
      const {W,D}=M.roomData('C');let best=null,distance=Infinity;
      for(let yy=0;yy<=D-profile.d;yy++)for(let xx=0;xx<=W-profile.w;xx++){
        const cost=(xx-x)**2+(yy-y)**2;
        if(cost>=distance||M.placementBlocker({...o,x:xx,y:yy},items))continue;
        best=[xx,yy];distance=cost;
      }
      if(!best)return false;
      [o.x,o.y]=best;
    }
    items.push(o);return true;
  }
  function upgradeLargeExhibits(items){
    for(const o of items){
      const slot=o.exhibit&&displaySlots.find(([old])=>old===o.k);
      if(!slot)continue;
      const [,k,x,y,f]=slot;
      if(!ProductCatalog.hasModel(k)||o.x!==x||o.y!==y||o.f!==f||o.e||o.turn!=null)continue;
      const item=ProductCatalog.restore(M.products,k);
      const replacement={...o,k};
      if(item.previousFootprint)replacement.artVersion=1;
      if(!M.placementBlocker(replacement,items.filter(other=>other!==o)))Object.assign(o,replacement);
    }
  }
  function updateDreamDisplay(previousC){
    if(!liveDream||cDisplayVersion>=4)return false;
    const imported=cDisplayVersion<1&&importFirstDisplay(previousC);
    if(cDisplayVersion<2&&!addDisplayDehumidifier(layouts.C))notice('C룸에 전시할 제습기 자리가 부족해요.');
    upgradeLargeExhibits(layouts.C);cDisplayVersion=4;
    return imported;
  }
  function importFirstDisplay(previousC){
    const current=previousC,old=storageOK&&localStorage.getItem(legacyRetroKey);
    const starter=!current||(current.length===1&&current[0].k==='sofa'&&current[0].x===44&&current[0].y===32&&current[0].turn===1&&current[0].e===0);
    let imported=false;
    if(starter&&old){
      try{
        const prior=JSON.parse(old);
        if(valid(prior)&&Array.isArray(prior.layouts.C)){
          layouts.C=prior.layouts.C.map(o=>({...o,id:id()}));imported=true;
        }
      }catch{notice('기존 C 전시 저장본을 읽지 못했어요.')}
    }
    if(current&&starter&&!imported)layouts.C=makeDisplay();
    layouts.C=layouts.C.filter(o=>!(o.exhibit&&['puri_m','puri_b','puri_p'].includes(o.k)));
    if(!addDisplayPurifiers(layouts.C))notice('C룸 공간이 부족해 일부 전시 제품을 놓지 못했어요.');
    return imported;
  }
  const record=()=>JSON.stringify({layoutVersion,...(liveDream?{cDisplayVersion}:{}),room,theme:tone,layouts,...(woodRooms.size?{woodRooms:[...woodRooms]}:{})});
  function save(){
    if(readOnly||!storageOK)return;
    try{localStorage.setItem(storeKey,record());return true}catch{storageOK=false;notice('자동 저장을 사용할 수 없어요. 방 메뉴에서 배치 파일을 저장해 주세요.')}
  }
  function checkpoint(before=JSON.stringify(list())){
    const stack=hist[room];stack.push({before,wood:woodRooms.has(room)});if(stack.length>80)stack.shift();
  }
  function select(o=null,stack=[]){selected=o;overlap=stack}
  function clearBrowseSelection(){
    if(!ready||!life||life.editing())return;
    select();$('keyboardTarget').hidden=true;paintFrame();
  }
  view.addEventListener('blur',clearBrowseSelection);
  view.addEventListener('keydown',e=>{
    if(!ready||!life||life.editing()||$('editMode').disabled)return;
    const items=ordered.filter(life.interactive);
    if(!items.length)return;
    if(['ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();
      const i=items.indexOf(selected),forward=e.key==='ArrowRight';
      select(items[i<0?(forward?0:items.length-1):(i+(forward?1:-1)+items.length)%items.length]);
      $('keyboardTarget').textContent=M.products[selected.k].n+' · Enter로 열기';
      $('keyboardTarget').hidden=false;reveal();paintFrame();
    }else if(e.key==='Enter'&&selected){
      e.preventDefault();life.tap(selected);
      $('lifeActions').querySelector('button,select')?.focus({preventScroll:true});
    }
  });
  function visibleItems(){
    return life?list().filter(life.visible):list().filter(o=>M.products[o.k]?.c!=='가전');
  }
  function redraw(){ordered=M.sorted(room,visibleItems());paintFrame()}
  function paintFrame(){
    const frame=life?.frame();
    if(gesture?.candidate){
      const preview=gesture.candidate;
      displayed=M.sorted(room,ordered.map(item=>item===gesture.o?preview:item));
      M.paint(ctx,room,tone,displayed,preview,frame,!!gesture.blocker,woodRooms.has(room));
      return;
    }
    const moving=frame?.movingRobot;
    const movingUnits=frame?.movingUnits;
    displayed=movingUnits?.size?M.sorted(room,ordered.flatMap(o=>{
      const body=movingUnits.get(o.id);
      if(!body)return [o];
      return body.robotPart==='mobile'?[{...o,robotPart:'station'},body]:[body];
    })):ordered;
    const focus=selected||(frame?.focusedProduct!=null?displayed.find(o=>o.id===frame.focusedProduct):null);
    M.paint(ctx,room,tone,displayed,moving&&focus?.id===moving.id?moving:focus,frame,false,woodRooms.has(room));
  }
  function placementStatus(k,unitId){
    if(unitId)return life.canAdd(k,unitId)?'놓을 수 있음':'배치됨';
    const count=list().filter(o=>o.k===k).length;
    return '이 방에 '+count+'개 배치';
  }
  function updateTools(){
    $('sample').hidden=!selected;$('actions').hidden=!selected;
    $('name').textContent=selected?M.products[selected.k].n+((M.products[selected.k].wall)?' · 벽걸이':''):browseHint();
    if(selected)M.thumbnail($('sample'),selected.k,tone,selected);
    const item=selected&&M.products[selected.k];
    const source=item?.modelCode&&(item.photoUrl||DOT_ASSETS.modelPhotos[item.spriteKey]);
    $('editPhoto').hidden=!source;
    if(source){
      $('sample').hidden=true;$('editPhoto').alt=item.modelCode;
      $('editPhoto').onerror=()=>{$('editPhoto').hidden=true;$('sample').hidden=false};
      $('editPhoto').src=source;
    }
    $('unknownEditModel').hidden=!selected||!life?.isAppliance(selected.k)||!!item?.modelCode;
    const wall=selected&&M.products[selected.k].wall;
    $('flip').textContent=wall?'벽 전환':'↻ 90°';
    $('flip').setAttribute('aria-label',wall?'부착 벽 전환':'오른쪽 90도 회전');
    $('ccw').hidden=!!wall;
    $('aim').hidden=selected?.k!=='sofa'||M.facingScreen(selected,ordered)==null;
    if(selected&&!wall)$('name').textContent+=' · '+(M.heading(selected)*90)+'°';
    $('overlap').hidden=overlap.length<2;
    $('undo').disabled=!hist[room].length;
    $('duplicate').disabled=!!(selected&&life&&!life.canAdd(selected.k));
    $('products').querySelectorAll('[data-key]').forEach(b=>{
      b.setAttribute('aria-pressed',String(b.dataset.key===selected?.k&&(!b.dataset.unit||b.dataset.unit===selected?.deviceId)));
      b.disabled=!!life&&!life.canAdd(b.dataset.key,b.dataset.unit);
      const status=b.querySelector('small');
      if(status)status.textContent=placementStatus(b.dataset.key,b.dataset.unit);
    });
  }
  function refresh(){$('comboHint').textContent='';redraw();updateTools()}
  function browseHint(){return camera.zoom>1?'빈 곳을 끌어 둘러보기':'제품을 눌러 선택'}
  function sync(){
    document.body.classList.toggle('lime',tone==='lime');
    document.querySelector('meta[name=theme-color]').content=tone==='pink'?'#3d2740':'#1f3328';
    for(const [attr,value] of [['room',room],['tone',tone],['cat',cat]])
      document.querySelectorAll('[data-'+attr+']').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[attr]===value)));
    $('wallView').hidden=room!=='A';
  }
  function inventory(){
    const items=Object.values(M.products).filter(i=>i.c===cat&&!ProductCatalog.componentOnly(i.k)&&(life?life.allowed(i.k):i.c!=='가전'));
    if(space==='my'&&cat==='가전'){
      items.sort((a,b)=>(myDrawerOrder.get(a.k)??myDrawerOrder.size)-(myDrawerOrder.get(b.k)??myDrawerOrder.size));
    }
    const cards=items.flatMap(item=>life&&space==='my'&&life.isAppliance(item.k)?
      life.owned(item.k).map(unit=>({item,unit})):[{item}]);
    $('count').textContent=items.length+'종';
    $('products').replaceChildren(...cards.map(({item,unit},index)=>{
      const b=document.createElement('button'),pic=document.createElement('canvas'),name=document.createElement('span');
      b.className='card';b.dataset.key=item.k;b.setAttribute('aria-pressed',String(selected?.k===item.k&&(!unit||unit.id===selected?.deviceId)));
      if(unit)b.dataset.unit=unit.id;
      b.disabled=!!life&&!life.canAdd(item.k,unit?.id);
      pic.width=64;pic.height=54;pic.setAttribute('aria-hidden','true');M.thumbnail(pic,item.k,tone);
      name.textContent=unit?.name||item.n;b.append(pic,name);
      if(life?.isAppliance(item.k)){
        const status=document.createElement('small');status.id='placement-'+index;
        b.setAttribute('aria-label',name.textContent);b.setAttribute('aria-describedby',status.id);
        status.textContent=placementStatus(item.k,unit?.id);
        b.append(status);
      }
      b.onclick=()=>add(item.k,unit?.id);return b;
    }));
    if(!items.length)$('products').textContent=!online?'제품 DB를 사용하려면 로컬 서버에서 방을 열어 주세요.':space==='my'?'ThinQ 등록 가전이 없어요.':'가전 수집에서 제품을 골라 보세요.';
    $('products').scrollTo(0,0);
  }
  function drawerOpen(open){
    drawer.classList.toggle('expanded',open);$('expand').setAttribute('aria-expanded',String(open));
    $('expand').textContent=open?'접기 ⌄':'펼치기 ⌃';
  }
  // Camera centre is stored in original PNG pixels. Pointer and pinch use the inverse transform.
  function fit(){
    if(!ready)return;
    const [l,t,r,b]=bounds[room], w=view.clientWidth,h=view.clientHeight;
    if(!w||!h)return;
    const k=Math.min((w-6)/(r-l),(h-6)/(b-t))*camera.zoom;
    const limit=(v,a,z)=>a>z?(a+z)/2:Math.min(z,Math.max(a,v));
    camera.x=limit(camera.x,l+w/(2*k)-5,r-w/(2*k)+5);
    camera.y=limit(camera.y,t+h/(2*k)-5,b-h/(2*k)+5);
    camera.k=k;camera.left=Math.round(w/2-camera.x*k);camera.top=Math.round(h/2-camera.y*k);
    Object.assign(cv.style,{left:camera.left+'px',top:camera.top+'px',width:cv.width*k+'px',height:cv.height*k+'px'});
    $('scale').textContent=Math.round(camera.zoom*100)+'%';
    if(!selected)$('name').textContent=browseHint();
    $('out').disabled=camera.zoom<=1.001;$('in').disabled=camera.zoom>=3.599;
  }
  function home(){
    const [l,t,r,b]=bounds[room];
    camera.zoom=1;camera.x=(l+r)/2;camera.y=(t+b)/2;fit();
  }
  function local(x,y){const rect=view.getBoundingClientRect();return {x:(x-rect.left)/previewScale,y:(y-rect.top)/previewScale}}
  function native(p){return {x:(p.x-camera.left)/camera.k,y:(p.y-camera.top)/camera.k}}
  function zoomAt(z,p={x:view.clientWidth/2,y:view.clientHeight/2},anchor=native(p)){
    camera.zoom=Math.max(1,Math.min(3.6,z));
    fit();camera.x=anchor.x+(view.clientWidth/2-p.x)/camera.k;
    camera.y=anchor.y+(view.clientHeight/2-p.y)/camera.k;fit();
  }
  function reveal(){
    if(!selected||camera.zoom===1)return;
    const {x,y,s}=M.place(room,tone,selected),k=camera.k;
    if(x*k+camera.left<4||(x+s.w)*k+camera.left>view.clientWidth-4||
      y*k+camera.top<4||(y+s.h)*k+camera.top>view.clientHeight-4){
      camera.x=x+s.w/2;camera.y=y+s.h/2;fit();
    }
  }
  function renderRoom(){
    $('keyboardTarget').hidden=true;
    life?.identifyDevices(list());life?.reset();
    const bg=M.bg(room,tone);cv.width=bg.width;cv.height=bg.height;
    select();drawerOpen(false);sync();inventory();refresh();home();
  }
  function add(k,unitId){
    if(ProductCatalog.componentOnly(k)||(life&&!life.canAdd(k,unitId)))return;
    const it=M.products[k],{W,D}=M.roomData(room);
    const o={id:id(),k,f:0,e:0,x:Math.round((W-it.w)/2),y:it.wall?0:Math.round((D-it.d)/2)};
    if(it.previousFootprint)o.artVersion=1;
    if(space==='my'&&k==='sofa')o.routineIds=[];
    if(!findSpace(o))return;
    checkpoint();life?.bindUnit(o,unitId);list().push(o);select(o);drawerOpen(false);
    const persisted=save();refresh();fit();reveal();if(persisted)life?.placementClue(o);
  }
  function placeCollected(k){
    cat=M.products[k].c;sync();inventory();add(k);
    view.focus({preventScroll:true});
  }
  function placementIssue(o,items){
    if((M.products[o.k].behaviorKey||o.k)==='robot_vacuum'&&M.robotCrossesStep(room,o))return '청소기나 앞쪽 이동 경로가 단차에 걸려요.';
    const blocker=M.placementBlocker(o,items);
    return blocker?M.products[blocker.k].n+' · 겹쳐서 놓을 수 없어요':'';
  }
  function findSpace(o){
    M.clamp(room,o);
    const items=visibleItems();
    // A low open drawer can fit on the floor while its entire lid is hidden by a tower.
    const drawer=M.products[o.k].washerStyle==='drawer';
    function lidVisible(candidate){
      const order=M.sorted(room,[...items,candidate]),loc=M.place(room,tone,candidate);
      return [0.38,0.5,0.62].every(fraction=>
        M.hits(room,tone,order,loc.x+loc.s.w*fraction,loc.y+loc.s.h*.42)[0]===candidate);
    }
    if(!placementIssue(o,items)&&(!drawer||lidVisible(o)))return true;
    const {W,D}=M.roomData(room),{w,d}=M.dims(o),wall=M.products[o.k].wall;
    const probe={...o},drawerSpots=[];let best=null,distance=Infinity;
    for(let y=0;y<=(wall&&!o.f?0:D-d);y++)for(let x=0;x<=(wall&&o.f?0:W-w);x++){
      const score=(x-o.x)**2+(y-o.y)**2;
      if(!drawer&&score>=distance)continue;
      probe.x=x;probe.y=y;M.clamp(room,probe);
      if(probe.x!==x||probe.y!==y||placementIssue(probe,items))continue;
      if(drawer)drawerSpots.push({x,y,score});
      if(score<distance){best={x,y};distance=score}
    }
    if(!best){notice('자리가 부족해요. 다른 제품을 옮겨 공간을 만들어 주세요.');return false}
    if(drawer){
      drawerSpots.sort((a,b)=>a.score-b.score);
      for(const spot of drawerSpots){
        probe.x=spot.x;probe.y=spot.y;
        if(lidVisible(probe)){best={x:spot.x,y:spot.y};break}
      }
    }
    Object.assign(o,best);return true;
  }
  function edit(change){
    if(!selected)return;
    const candidate={...selected};change(candidate);M.clamp(room,candidate);
    const issue=placementIssue(candidate,ordered);
    if(issue){notice(issue);return}
    if(JSON.stringify(selected)===JSON.stringify(candidate))return;
    checkpoint();delete selected.rotationOrigin;Object.assign(selected,candidate);
    overlap=[];save();refresh();reveal();
  }
  const rotate=step=>edit(o=>M.turnTo(room,o,M.products[o.k].wall?(o.f?0:3):M.heading(o)+step));
  const flip=()=>rotate(1);
  $('ccw').onclick=()=>rotate(-1);
  $('aim').onclick=()=>edit(o=>{const next=M.facingScreen(o,ordered);if(next!=null)M.turnTo(room,o,next)});
  const height=n=>edit(o=>o.e=Math.max(-M.products[o.k].elev,o.e+n));
  function duplicate(){
    if(!selected||(life&&!life.canAdd(selected.k)))return;
    const o={...selected,id:id(),x:selected.x+3,y:selected.y+3};
    if(space==='my'&&M.products[o.k].c==='가구')o.routineIds=[];
    delete o.rotationOrigin;delete o.deviceId;
    if(!findSpace(o))return;
    life?.bindUnit(o);checkpoint();list().push(o);select(o);save();refresh();reveal();
  }
  function remove(){if(!selected)return;checkpoint();layouts[room]=list().filter(o=>o!==selected);select();save();refresh()}
  function undo(){
    const previous=hist[room].pop();if(!previous)return;
    layouts[room]=JSON.parse(previous.before);
    if(previous.wood)woodRooms.add(room);else woodRooms.delete(room);
    select();save();refresh();
  }
  const pointers=new Map();let gesture=null;
  function pinchData(){
    const [a,b]=[...pointers.values()];
    return {mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},dist:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
  }
  view.onpointerdown=e=>{
    if(!ready||e.button!==0)return;
    if(!$('keyboardTarget').hidden)clearBrowseSelection();
    const p=local(e.clientX,e.clientY);
    view.setPointerCapture(e.pointerId);pointers.set(e.pointerId,p);view.classList.add('busy');
    if(pointers.size===2){
      const {mid,dist}=pinchData();
      gesture={type:'pinch',dist,anchor:native(mid),zoom:camera.zoom};
      $('placementHint').textContent='';paintFrame();return;
    }
    if(pointers.size!==1)return;
    const n=native(p), stack=M.hits(room,tone,displayed,n.x,n.y);
    const visiting=life&&!life.editing(),finger=visiting&&e.pointerType==='touch';
    if(finger&&(!stack.length||!M.products[stack[0].k].layer)){
      const near=M.nearbyTarget(room,tone,displayed,n.x,n.y,10/camera.k,life.interactive);
      if(near)stack.unshift(near);
    }
    if(displayed!==ordered)for(let i=0;i<stack.length;i++)stack[i]=ordered.find(o=>o.id===stack[i].id);
    // After explicitly picking a covered object, dragging that same overlap moves it.
    const o=overlap.length>1&&stack.includes(selected)?selected:stack[0];
    gesture=visiting?{type:'visit',p,o,slop:finger?10:4,x:camera.x,y:camera.y,k:camera.k}:o?{type:'move',o,stack,p,ox:o.x,oy:o.y,k:camera.k,before:JSON.stringify(list())}:
      {type:'pan',p,x:camera.x,y:camera.y,k:camera.k};
  };
  view.onpointermove=e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;
    const p=local(e.clientX,e.clientY);pointers.set(e.pointerId,p);
    if(gesture.type==='pinch'){
      if(pointers.size<2)return;
      const {mid,dist}=pinchData();zoomAt(gesture.zoom*dist/gesture.dist,mid,gesture.anchor);return;
    }
    const g=gesture,dx=p.x-g.p.x,dy=p.y-g.p.y;
    if(!g.moved&&Math.hypot(dx,dy)<(g.slop??4))return;
    g.moved=true;
    if(g.type==='pan'||g.type==='visit'){camera.x=g.x-dx/g.k;camera.y=g.y-dy/g.k;fit();return}
    previewMove(g,dx,dy);
  };
  function previewMove(g,dx,dy){
    const o={...g.o},mx=dx/g.k,my=dy/g.k;
    let wx=(mx/2+my)/2,wy=(my-mx/2)/2;
    if(M.products[o.k].wall){
      if(o.f){wy=(-2*mx+my)/5;wx=0}else{wx=(2*mx+my)/5;wy=0}
    }
    o.x=g.ox+Math.round(wx);o.y=g.oy+Math.round(wy);M.clamp(room,o);
    g.candidate=o;const message=placementIssue(o,ordered);
    g.blocker=message;
    if(!message)g.lastValid=o;
    if($('placementHint').textContent!==message)$('placementHint').textContent=message;
    select(g.o);paintFrame();
  }
  function finish(e,cancelled){
    if(!pointers.has(e.pointerId))return;
    pointers.delete(e.pointerId);
    if(gesture?.type==='pinch'){if(pointers.size>=2)return;gesture=null}
    const g=gesture;
    if(g?.type==='move'&&g.moved&&!cancelled){
      const p=local(e.clientX,e.clientY);previewMove(g,p.x-g.p.x,p.y-g.p.y);
    }
    gesture=null;$('placementHint').textContent='';
    if(g?.type==='visit'&&!cancelled&&!g.moved){
      const end=local(e.clientX,e.clientY);
      if(Math.hypot(end.x-g.p.x,end.y-g.p.y)<g.slop)life.tap(g.o);
    }
    else if(g?.type==='move'){
      if(!cancelled&&g.moved){
        const end=g.lastValid;
        if(end&&(end.x!==g.ox||end.y!==g.oy)){
          checkpoint(g.before);g.o.x=end.x;g.o.y=end.y;delete g.o.rotationOrigin;save();
        }
        if(g.blocker)notice('마지막으로 놓을 수 있던 자리에 두었어요.');
        select(g.o);
      }else if(!cancelled)select(g.stack[0],g.stack);
    }else if(g?.type==='pan'&&!g.moved&&!cancelled)select();
    if(!pointers.size)view.classList.remove('busy');
    refresh();
  }
  view.onpointerup=e=>finish(e,false);view.onpointercancel=e=>finish(e,true);
  view.onlostpointercapture=e=>{if(pointers.has(e.pointerId))finish(e,true)};
  view.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.shiftKey&&camera.zoom>1){camera.x+=e.deltaY/camera.k;fit()}
    else zoomAt(camera.zoom*Math.exp(-e.deltaY*.002),local(e.clientX,e.clientY));
  },{passive:false});
  $('in').onclick=()=>zoomAt(camera.zoom*1.45);$('out').onclick=()=>zoomAt(camera.zoom/1.45);
  $('overview').onclick=home;
  $('wallView').onclick=()=>{camera.zoom=2.2;const [x,y]=M.project('A',59,6,0);camera.x=x;camera.y=y-15;fit()};
  $('expand').onclick=()=>drawerOpen(!drawer.classList.contains('expanded'));
  let handleY;
  const handle=document.querySelector('.drawerHead');
  handle.addEventListener('touchstart',e=>handleY=e.touches[0].clientY,{passive:true});
  handle.addEventListener('touchend',e=>{const dy=(e.changedTouches[0].clientY-handleY)/previewScale;if(Math.abs(dy)>22)drawerOpen(dy<0)},{passive:true});
  $('flip').onclick=flip;$('up').onclick=()=>height(1);$('down').onclick=()=>height(-1);
  $('duplicate').onclick=duplicate;$('remove').onclick=remove;$('undo').onclick=undo;
  $('overlap').onclick=()=>{select(overlap[(overlap.indexOf(selected)+1)%overlap.length],overlap);refresh()};
  $('more').onclick=()=>$('menu').showModal();
  document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('clear').onclick=()=>{checkpoint();layouts[room]=[];select();save();refresh();$('menu').close()};
  $('reset').onclick=()=>{checkpoint();layouts[room]=defaultLayout(room);$('menu').close();renderRoom();save()};
  $('shot').onclick=()=>{
    const c=document.createElement('canvas');c.width=cv.width*4;c.height=cv.height*4;
    const x=c.getContext('2d');x.scale(4,4);M.paint(x,room,tone,ordered,null,null,false,woodRooms.has(room));
    const url=c.toDataURL('image/png');$('exportImage').src=url;
    $('download').href=url;$('download').download='MY DOT ROOM '+room+' '+tone+'.png';
    $('menu').close();$('picture').showModal();
  };
  function downloadLayout(text,filename){
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('saveFile').onclick=()=>downloadLayout(record(),'dotroom.json');
  $('previousLayout').onclick=()=>{
    const backup=localStorage.getItem(backupKey());
    if(backup)downloadLayout(backup,'dotroom-before-wood.json');
  };
  $('openFile').onclick=()=>$('layoutFile').click();
  $('layoutFile').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    try{
      const raw=JSON.parse(await file.text());
      if(!valid(raw))throw Error();
      if(!confirm('이 파일의 방과 배치로 바꿀까요? 현재 배치는 방 메뉴에서 파일로 저장할 수 있어요.'))return;
      restore(raw);cleanLayouts();Object.values(hist).forEach(h=>h.length=0);storageOK=true;save();$('menu').close();renderRoom();
    }catch{alert('MY DOT ROOM 배치 JSON 파일을 확인해 주세요.')}
  };
  addEventListener('keydown',e=>{
    if((life&&!life.editing())||!ready||gesture||document.querySelector('dialog[open]')||e.target.tagName==='INPUT')return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return}
    if(!selected)return;
    const mv={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(mv){e.preventDefault();edit(o=>{
      if(M.products[o.k].wall){if(o.f)o.y+=mv[0]+mv[1];else o.x+=mv[0]+mv[1]}
      else{o.x+=mv[0];o.y+=mv[1]}
    });return}
    switch(e.key.toLowerCase()){
      case 'r':rotate(e.shiftKey?-1:1);break;case 'd':duplicate();break;case ']':height(1);break;case '[':height(-1);break;
      case 'delete':case 'backspace':e.preventDefault();remove();break;case 'escape':select();refresh();break;
    }
  });
  function logo(){
    const glyphs={M:['10001','11011','10101','10001','10001'],Y:['10001','01010','00100','00100','00100'],
    D:['11110','10001','10001','10001','11110'],O:['01110','10001','10001','10001','01110'],
    T:['11111','00100','00100','00100','00100'],R:['11110','10001','11110','10100','10010']};
    const c=$('logo');c.width=76;c.height=10;const x=c.getContext('2d');
    x.fillStyle='#ffc99e';[[5,0,2,1],[3,1,6,1],[2,2,8,1],[1,3,10,1],[2,4,8,5]].forEach(a=>x.fillRect(...a));
    x.clearRect(5,6,2,3);x.fillStyle='#fff1de';
    let left=15;for(const ch of 'MY DOT ROOM'){if(ch===' '){left+=3;continue}
      glyphs[ch].forEach((row,y)=>[...row].forEach((dot,i)=>{if(dot==='1')x.fillRect(left+i,2+y,1,1)}));left+=6}
    c.style.aspectRatio='76 / 10';
  }
  async function init(){
    logo();let raw=null;
    if(online){
      try{await ProductCatalog.loadModels();await ProductCatalog.loadRetiredSales()}catch{
        storageOK=false;$('name').textContent='제품 DB를 열 수 없어요. 서버 연결 후 새로고침해 주세요.';return;
      }
    }
    await Promise.all([M.load(),online&&ProductCatalog.loadBodies().catch(()=>{
      notice('제품별 외형 정보를 불러오지 못해 기본 도트로 표시해요.');
    })]);
    if(online){
      if(compareWashers){
        const link=$('washerShelf'),nextShelf=washerShelf===1?2:1,url=new URL(location.href);
        url.searchParams.set('shelf',String(nextShelf));
        link.href=url.href;link.textContent='비교 '+nextShelf+'관 보기';link.hidden=false;
      }
      if(!compareWashers){
        for(const item of Object.values(M.products)){
          if(item.washerStyle)item.photoUrl='/api/catalog/photo?'+new URLSearchParams({category:'세탁기',model:item.modelCode,v:'2'});
        }
      }
      const model=await import('./state.js');
      for(const k of model.state.collection)ProductCatalog.restore(M.products,k);
      if(space==='my'){
        await model.loadHome();
        if(model.homeSource!=='demo')storeKey+='.'+model.homeSource;
        if(model.homeSource==='unavailable')storageOK=false;
      }
      if(!readOnly)try{model.pruneRetiredCollection()}catch(e){storageOK=false;notice(e.message);return}
      for(const k of [...Object.values(model.demoModels),...model.registeredAppliances().map(d=>d.k)]){
        if(ProductCatalog.hasModel(k))ProductCatalog.restore(M.products,k);
      }
      life=createLivingRoom({model,space,compareWashers,M,$,list,id,room:()=>room,tone:()=>tone,notice,
        draw:paintFrame,refresh,inventory,placeCollected,save,checkpoint,home,findSpace,select,drawerOpen,gestureActive:()=>!!gesture});
    }
    try{
      const old=space==='example'?null:localStorage.getItem(storeKey);
      if(old!==null){
        raw=JSON.parse(old);
        if(!valid(raw)||(raw.layoutVersion!=null&&raw.layoutVersion!==layoutVersion))throw Error();
        life?.restoreDeviceIds(raw);
        if(raw.layoutVersion==null&&storageOK){
          // Write the original first. A failed backup must never overwrite the active layout.
          if(!readOnly&&localStorage.getItem(backupKey())===null)localStorage.setItem(backupKey(),old);
          raw={room:'B',theme:raw.theme,layouts:{}};
        }
      }
      $('previousLayout').hidden=readOnly||localStorage.getItem(backupKey())===null;
    }catch{
      if(!valid(raw))raw=null;
      storageOK=false;notice('기존 배치를 보존하기 위해 자동 저장을 멈췄어요.');
    }
    const previousC=raw?.layouts?.C;
    restore(raw);
    const importedRetro=updateDreamDisplay(previousC);cleanLayouts();
    if(liveDream&&params.get('display')==='retro')room='C';
    else if(space==='dream'&&Object.hasOwn(M.names,params.get('room')))room=params.get('room');
    if(liveDream&&(params.has('room')||params.get('display')==='retro')){
      const url=new URL(location.href);url.searchParams.delete('room');url.searchParams.delete('display');
      history.replaceState(history.state,'',url);
    }
    $('retroRoom').hidden=!liveDream;
    if(online)fetch('/experience/qr',{method:'HEAD'}).then(r=>{$('visitorQR').hidden=!r.ok}).catch(()=>{});
    for(const [r,name] of Object.entries(M.names)){
      const b=document.createElement('button');b.dataset.room=r;b.innerHTML='<b>'+r+'</b>'+name;
      b.onclick=()=>{
        if(room===r)return;room=r;renderRoom();save();
      };$('rooms').append(b);
    }
    document.querySelectorAll('[data-tone]').forEach(b=>b.onclick=()=>{
      tone=b.dataset.tone;sync();inventory();refresh();save();
    });
    for(const c of cats){const b=document.createElement('button');b.dataset.cat=c;b.textContent=c;
      b.onclick=()=>{cat=c;sync();inventory()};$('categories').append(b)}
    if(location.protocol==='file:')$('mini').hidden=true;
    ready=true;renderRoom();life?.enter();
    if(save()&&importedRetro)localStorage.removeItem(legacyRetroKey);
    new ResizeObserver(fit).observe(view);
  }
  init().catch(e=>{console.error(e);$('name').textContent='방 이미지를 열 수 없어요. 페이지를 새로고침해 주세요.'});
})();

function createLivingRoom({model,space,compareWashers,M,$,list,id,room,tone,notice,draw,refresh,inventory,placeCollected,save,checkpoint,home,findSpace,select,drawerOpen,gestureActive}){
  const my=space==='my',params=new URLSearchParams(location.search);
  const friend=space==='example',menu=space==='menu',readOnly=friend||menu;
  const samplePreview=friend&&params.has('previewTemplate');
  const source=(friend&&!samplePreview)||params.get('source')==='example_room'?'example_room':'collection';
  const baseKey=k=>M.products[k]?.behaviorKey||k;
  const isTV=o=>o && ['tvset','standbyme'].includes(baseKey(o.k));
  const saved=()=>model.state.savedRoutines.find(r=>r.anchorId==='sofa'&&r.templateId==='movie-night');
  let editMode=false, panel='idle',target=null,seat=null,start=null,started=0,walking=false;
  let furniture=null,composerFurniture=null,movieFurniture=null;
  const isFurniture=o=>o&&M.products[o.k].c==='가구'&&!isAppliance(o.k);
  let playback=null,previousPanel='idle',bindings={},raf=0,lastFrame=-100,offer=null;
  let lampOn=false,poweredTV=null,sceneBeforeMovie=null;
  let sleepBed=null;
  let reaction=null;
  let productTapTime=-Infinity;
  let previewFurniture=[];
  let cleaningRuns=[];
  const approachMs=740,reactionCycleMs=2100;
  const sample=model.homeSource==='demo';
  const hasHome=()=>model.homeSource==='thinq'||(sample&&model.state.myFixtureId==='sample-home-v1');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let skipped=false,offeredTarget=null;
  const still=()=>skipped||reducedMotion.matches;
  const log=(event,origin=source)=>model.logObservation(event,space,origin);
  const savedSource=()=>model.savedObservationSource(source);
  function observeOffer(button,item){
    if(!model.observing||offeredTarget===item)return;
    const watcher=new IntersectionObserver(entries=>{
      if(offer===watcher && button.isConnected && document.visibilityState==='visible' && entries.some(e=>e.isIntersecting)){
        offeredTarget=item;log('routine_offered');watcher.disconnect();
      }
    });
    offer=watcher;watcher.observe(button);
  }
  const tvAction=model.actions.find(a=>a.kind==='tv');
  const tvCatalog=()=>(sample?model.devices:model.registeredAppliances()).filter(d=>d.kind==='tv');
  const nameOf=id=>tvCatalog().find(d=>d.id===id)?.name||'이전 TV';
  const liveTVs=()=>model.candidates(tvAction);
  const screenFor=id=>list().find(o=>isTV(o)&&o.deviceId===id&&visible(o));
  const availableTVs=()=>liveTVs().filter(d=>screenFor(d.id));
  const available=id=>!!id&&availableTVs().some(d=>d.id===id);
  const needsRepair=()=>!!saved()&&!available(saved().bindings['tv-on']);
  const isAppliance=k=>model.isCollectibleProduct(k)||k==='floor_lamp';
  const owned=k=>model.registeredAppliances().filter(d=>d.k===k);
  function allowed(k){
    if(M.products[k]?.c==='가전'&&!ProductCatalog.hasModel(k))return false;
    if(k==='floor_lamp'&&!my)return true;
    if(friend||!isAppliance(k))return true;
    return my?owned(k).length>0:model.collected(k);
  }
  function visible(o){
    if(o.bundleId!=null)return false;
    if(M.products[o.k]?.c==='가전'&&!ProductCatalog.hasModel(o.k))return false;
    if((space==='dream'||menu)&&room()==='C'&&o.exhibit)return true;
    if(!my||!isAppliance(o.k))return allowed(o.k);
    return owned(o.k).some(d=>d.id===o.deviceId)&&
      list().find(other=>other.k===o.k&&other.deviceId===o.deviceId)===o;
  }
  function freeUnit(k,unitId){
    return owned(k).find(d=>(!unitId||d.id===unitId)&&!list().some(o=>o.k===k&&o.deviceId===d.id));
  }
  function canAdd(k,unitId){
    return allowed(k)&&(!my||!isAppliance(k)||!!freeUnit(k,unitId));
  }
  function bindUnit(o,unitId){
    if(!my||!isAppliance(o.k))return;
    const d=freeUnit(o.k,unitId);
    if(!d)throw Error('이 방에 놓을 수 있는 등록 기기가 없어요.');
    o.deviceId=d.id;
  }
  const hasLamp=()=>list().some(o=>o.k==='floor_lamp'&&visible(o));
  const templates=model.applianceTemplates,groups=model.applianceGroups;
  const groupFor=k=>Object.keys(groups).find(kind=>groups[kind].keys.includes(baseKey(k)));
  const recipeFor=k=>templates.find(t=>t.actions.some(a=>a.kind===groupFor(k)));
  const tapKind=k=>k==='dryer'?'washer':k?.startsWith('fridge_')?'fridge':['vacuum','robot_vacuum','humidifier','dehumidifier'].includes(k)?k:null;
  const tapDescriptions={
    air:'고양이가 에어컨 바람을 맞으며 귀를 살짝 접어요.',
    purifier:'고양이가 공기청정기 앞에서 코를 들고 바람 냄새를 맡아요.',
    dehumidifier:'고양이가 제습기 옆에 앉아 표시등을 바라봐요.',
    humidifier:'고양이가 가습기 옆에 앉아 가습기를 바라봐요.',
    washer:'고양이가 세탁조 안에서 도는 양말을 눈으로 따라가요.',
    styler:'고양이가 김이 오르는 스타일러 앞에 몸을 말고 잠들어요.',
    fridge:'고양이가 냉장고 문을 올려다보며 간식을 기다려요.',
    vacuum:'청소기가 떨리면 고양이가 한 발 물러났다가 다시 들여다봐요.',
    robot_vacuum:'고양이가 움직이는 로봇청소기를 눈으로 따라가요.'
  };
  let recipe=null,recipeBindings={},recipeEffects={};
  function remember(t){
    try{model.rememberPreview(t.id,source)}catch{notice('발견 기록을 저장할 수 없어요. 저장 공간을 확인해 주세요.')}
  }
  function productUse(k){
    k=baseKey(k);
    if(k==='robot_vacuum')return tapDescriptions[k]+' 청소 시간 루틴을 시작할 수 있어요.';
    if(tapKind(k))return tapDescriptions[tapKind(k)];
    if(isTV({k}))return '영화 보기에서 화면을 켜요.';
    if(k==='floor_lamp')return '영화 보기에서 조명을 30%로 낮춰요.';
    const t=recipeFor(k),a=t?.actions.find(a=>a.kind===groupFor(k));
    return a?t.name+'에서 '+a.label+' 동작을 체험해요.':'방을 꾸미는 수집품이에요. 연결된 루틴은 아직 없어요.';
  }
  const savedRecipe=t=>model.state.savedRoutines.find(r=>r.templateId===t.id);
  function restoreDeviceIds(raw){
    // Old sample homes assigned random IDs on placement. Reuse them only for
    // the models already present in the sample account, never grant a model from a layout.
    if(!my||!sample||!hasHome()||!raw||model.state.sampleDeviceIds)return;
    const items=Object.values(raw.layouts).filter(Array.isArray).flat();
    const linked=new Set(model.state.savedRoutines.flatMap(r=>Object.values(r.bindings)));
    const ids={};
    for(const [old,k] of Object.entries(model.demoModels)){
      const group=groupFor(k);if(!group)continue;
      const candidates=items.filter(o=>(o.k===k||o.k===old)&&typeof o.deviceId==='string'&&
        new RegExp('^my-'+group+'-[a-f0-9]+-[a-f0-9]+-[a-f0-9]+$').test(o.deviceId));
      const existing=candidates.find(o=>linked.has(o.deviceId))||candidates[0];
      if(existing)ids[k]=existing.deviceId;
    }
    if(Object.keys(ids).length)try{model.update(s=>s.sampleDeviceIds=ids)}catch(e){notice(e.message)}
  }
  function registeredReplacement(o){
    if(!my)return;
    const units=model.registeredAppliances();
    return (units.find(d=>d.id===o.deviceId)||
      (sample&&!o.deviceId&&units.find(d=>d.k===model.demoModels[o.k])))?.k;
  }
  function identifyDevices(items){
    if(!my||!sample||!hasHome())return;
    for(const o of items){
      if(!isAppliance(o.k)||o.deviceId)continue;
      const unit=owned(o.k).find(d=>!items.some(other=>other.k===o.k&&other.deviceId===d.id));
      if(unit)o.deviceId=unit.id;
    }
  }
  function planTV(d){
    const key=d.k||model.demoModels[d.id==='my-tv-1'?'tvset':'standbyme'];
    const existing=screenFor(d.id)||list().find(o=>o.k===key&&!o.deviceId);
    if(existing)return existing;
    const primary=d.id==='my-tv-1';
    const o={id:id(),deviceId:d.id,k:key,x:primary?1:65,y:primary?49:8,f:primary?1:0,e:0};
    return findSpace(o)?o:null;
  }
  function placeTV(o,deviceId){
    o.deviceId=deviceId;
    if(!list().includes(o))list().push(o);
  }
  function ensureTV(d){
    const o=planTV(d);if(o)placeTV(o,d.id);
  }
  function floorPoint(gx,gy){
    const {zones}=M.roomData(room());
    const level=zones.find(([x1,y1,x2,y2])=>gx>=x1&&gx<x2&&gy>=y1&&gy<y2)?.[4]||0;
    const [x,y]=M.project(room(),gx,gy,level);
    return {x,y,depth:gx+gy};
  }
  function spawn(){
    const home=floorPoint(28,43),robots=list().filter(o=>baseKey(o.k)==='robot_vacuum'&&visible(o));
    if(!robots.length||cleanerClearance([],robots)(home))return home;
    // A newly placed cleaner can cover the default idle spot before anything is tapped.
    const clear=cleanerClearance([]);
    let closest=home,best=Infinity;
    for(const [x,y] of standingTiles()){
      const distance=(x-28)**2+(y-43)**2;
      if(distance>=best)continue;
      const point=floorPoint(x,y);
      if(clear(point)){closest=point;best=distance}
    }
    return closest;
  }
  function sofaPoint(o){
    const {w,d}=M.dims(o),cx=o.x+w/2,cy=o.y+d/2;
    const [x,y]=M.project(room(),cx,cy,M.elevation(room(),o)+6.7);
    return {x,y,depth:cx+cy};
  }
  let standing=null;
  function position(now){
    const end=seat?sofaPoint(seat):(standing??=spawn());
    const t=Math.min(1,(now-started)/approachMs);
    if(!walking||t>=1){walking=false;return end}
    const eased=t*t*(3-2*t);
    return {x:start.x+(end.x-start.x)*eased,y:start.y+(end.y-start.y)*eased-3*Math.sin(Math.PI*t),depth:start.depth+(end.depth-start.depth)*eased};
  }
  function animate(){
    if(!raf)raf=requestAnimationFrame(function tick(now){
      raf=0;
      if(now-lastFrame>=60){lastFrame=now;draw()}
      if(walking||((playback||reaction||poweredTV)&&!still()))animate();
    });
  }
  function nearbySofa(tv){
    const {w,d}=M.dims(tv);
    let nearest=null,best=27; // Maximum walking distance from the TV to a seat, in floor units.
    // Measure the gap between occupied floor areas, in room units.
    for(const sofa of list().filter(o=>o.k==='sofa')){
      const size=M.dims(sofa);
      const dx=Math.max(0,sofa.x-tv.x-w,tv.x-sofa.x-size.w);
      const dy=Math.max(0,sofa.y-tv.y-d,tv.y-sofa.y-size.d);
      const distance=Math.hypot(dx,dy);
      if(distance<=best){nearest=sofa;best=distance}
    }
    return nearest;
  }
  // Test the seated silhouette in screen pixels, including the small head movement and a gap.
  function cleanerClearance(runs,items=list()){
    const sprites=[];
    function include(item,original=item){
      sprites.push({original,flip:item.f,...M.place(room(),tone(),item)});
    }
    for(const item of items)if(visible(item)&&M.products[item.k].layer)include(item);
    for(const {item,path} of runs){
      for(let step=1;step<=path.length;step++){
        const moved={...item,x:item.x+step*path.dx,y:item.y+step*path.dy};
        if(M.products[item.k].hasDock)moved.robotPart='mobile';
        include(moved,item);
      }
    }
    return (point,ignore=null)=>{
      const px=Math.round(point.x),py=Math.round(point.y);
      for(const {original,flip,s,x,y} of sprites){
        if(original===ignore)continue;
        const left=Math.max(0,px-18-x),right=Math.min(s.w-1,px+18-x);
        const top=Math.max(0,py-29-y),bottom=Math.min(s.h-1,py+4-y);
        if(left>right||top>bottom)continue;
        for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
          if(s.pixels[(row*s.w+(flip?s.w-1-col:col))*4+3]>10)return false;
        }
      }
      return true;
    };
  }
  function* standingTiles(){
    const {W,D}=M.roomData(room());
    for(let x=2;x<=W-2;x+=2)for(let y=2;y<=D-2;y+=2){
      if(room()==='B'&&x+2>52&&y+2>48)continue;
      yield [x,y];
    }
  }
  function clearApproach(from,to,clear,ignore=null){
    if(still()||!from)return true;
    const dx=to.x-from.x,dy=to.y-from.y,steps=Math.ceil(Math.hypot(dx,dy)/3);
    let outside=clear(from,ignore);
    for(let i=1;i<steps;i++){
      const t=i/steps,eased=t*t*(3-2*t);
      const point={x:from.x+dx*eased,y:from.y+dy*eased-3*Math.sin(Math.PI*t)};
      if(clear(point,ignore))outside=true;
      else if(outside)return false;
    }
    return true;
  }
  function standingPoint(item,kind,patrol=null,clearForCat=null){
    const {w,d}=M.dims(item),{W,D}=M.roomData(room());
    // Let the cat observe the cleaner from beside its forward lane.
    const side=kind==='robot_vacuum'||kind==='cleaning';
    const [nx,ny]=M.frontStep((M.heading(item)+(side?1:0))%4);
    const cx=item.x+w/2,cy=item.y+d/2,gap=kind==='washer'?4:kind==='cleaning'?15:8;
    const frontX=cx+nx*(w/2+gap),frontY=cy+ny*(d/2+gap);
    const level=M.zone(room(),item);
    const watchFromSide=patrol||kind==='humidifier'||kind==='dehumidifier';
    const appliance=watchFromSide&&M.place(room(),tone(),item);
    const travelX=patrol?patrol.dx*patrol.length:0,travelY=patrol?patrol.dy*patrol.length:0;
    const screenTravelX=2*(travelX-travelY);
    const nearEdge=appliance?appliance.x+Math.min(0,screenTravelX):0;
    const farEdge=appliance?appliance.x+appliance.s.w+Math.max(0,screenTravelX):0;
    const watchY=appliance?appliance.y+appliance.s.h+(travelX+travelY)/2+3:0;
    if(!clearForCat){
      const robots=list().filter(o=>baseKey(o.k)==='robot_vacuum'&&visible(o));
      if(robots.length)clearForCat=cleanerClearance([],robots);
    }
    const obstacles=list().filter(o=>visible(o)&&M.products[o.k].layer&&!M.products[o.k].wall)
      .map(o=>({x:o.x,y:o.y,...M.dims(o),loc:kind&&M.place(room(),tone(),o),flipped:o.f}));
    let best=Infinity,point=null;
    for(const [x,y] of standingTiles()){
      if(x>=item.x-1&&x<=item.x+w+1&&y>=item.y-1&&y<=item.y+d+1)continue;
      const floor=floorPoint(x,y);
      let score;
      if(watchFromSide){
        // Score both sides of the whole patrol in screen space, so the silhouettes read side by side.
        if(x>=item.x+Math.min(0,travelX)-2&&x<=item.x+w+Math.max(0,travelX)+2&&
           y>=item.y+Math.min(0,travelY)-2&&y<=item.y+d+Math.max(0,travelY)+2)continue;
        const left=(floor.x-(nearEdge-19))**2,right=(floor.x-(farEdge+19))**2+24;
        score=Math.min(left,right)+2*(floor.y-watchY)**2;
        score+=12*Math.max(0,8-Math.min(x,y,W-x,D-y))**2;
        if(floor.y!==M.project(room(),x,y,level)[1])score+=2400;
      }else if(kind==='washer'){
        const across=(x-frontX)*ny-(y-frontY)*nx,along=(x-frontX)*nx+(y-frontY)*ny;
        score=(Math.abs(across)-6)**2+along**2;
      }else score=(x-frontX)**2+(y-frontY)**2;
      if(score>=best)continue;
      if(obstacles.some(o=>x>o.x-2&&x<o.x+o.w+2&&y>o.y-2&&y<o.y+o.d+2))continue;
      if(!watchFromSide&&(x-cx)*nx+(y-cy)*ny<0)score+=100;
      if(score>=best)continue;
      if(clearForCat&&(!clearForCat(floor)||!clearApproach(start,floor,clearForCat)))continue;
      // Check the cat's silhouette as well as its floor tile in a crowded room.
      if(kind&&obstacles.some(o=>{
        if(o.x+o.y<=floor.depth)return false;
        const {s}=o.loc;
        return [-10,0,10].some(dx=>[-21,-13,-4].some(dy=>{
          const px=floor.x+dx-o.loc.x,py=floor.y+dy-o.loc.y;
          return px>=0&&px<s.w&&py>=0&&py<s.h&&s.pixels[(py*s.w+(o.flipped?s.w-1-px:px))*4+3]>10;
        }));
      }))score+=1600;
      if(score<best){best=score;point=floor}
    }
    return point||spawn();
  }
  function watch(tv,sofa=nearbySofa(tv)){
    const current=position(performance.now());
    if(target===tv&&seat===sofa&&(sofa||standing))return;
    start=current;target=tv;seat=sofa;standing=sofa?null:standingPoint(tv);
    const end=sofa?sofaPoint(sofa):standing;
    started=performance.now();walking=!still()&&Math.hypot(end.x-current.x,end.y-current.y)>1;
    if(walking)animate();
  }
  function approachAppliance(item,kind){
    const now=performance.now();
    start=position(now);seat=null;target=item;
    const patrol=kind==='robot_vacuum'?robotPath(item,null):null;
    const clearance=patrol&&cleanerClearance([{item,path:patrol}]);
    standing=standingPoint(item,kind,patrol,clearance);started=now;
    walking=!still()&&Math.hypot(standing.x-start.x,standing.y-start.y)>1;
    reaction={itemId:item.id,kind,wall:item.k==='wall_ac',arrives:now+(walking?approachMs:0)};
    if(patrol){
      reaction.path=robotPath(item);
      const loc=M.place(room(),tone(),item),{dx,dy,length}=reaction.path;
      reaction.facingLeft=loc.x+loc.s.w/2+(dx-dy)*length<standing.x;
    }
    if(!still())animate();
  }
  function robotPath(item,resting=standing,reserved=[]){
    const {w,d}=M.dims(item),level=M.zone(room(),item);
    const [dx,dy]=M.frontStep(M.heading(item));
    const blocks=list().filter(o=>o!==item&&visible(o)&&M.products[o.k].layer&&!M.products[o.k].wall);
    let length=0;
    for(let n=1;n<=M.robotTravel;n++){
      const x=item.x+dx*n,y=item.y+dy*n,probe={...item,x,y};
      M.clamp(room(),probe);
      if(probe.x!==x||probe.y!==y||M.robotCrossesStep(room(),item,n))break;
      if(blocks.some(o=>{
        const size=M.dims(o);
        return x<o.x+size.w&&x+w>o.x&&y<o.y+size.d&&y+d>o.y;
      }))break;
      if(reserved.some(b=>x<b.x+b.w&&x+w>b.x&&y<b.y+b.d&&y+d>b.y))break;
      const [cx,cy]=M.project(room(),x+w/2,y+d/2,level);
      if(resting&&Math.hypot(cx-resting.x,cy-resting.y)<13)break;
      length=n;
    }
    return {dx,dy,length};
  }
  function blockedRobotMessage(item){
    return M.robotCrossesStep(room(),item,1)
      ?'앞쪽 단차에 걸려요. 배치 편집에서 위치나 방향을 바꿔 주세요.'
      :'앞쪽에 빈 통로가 없어 제자리에서 표시등만 깜박여요.';
  }
  function stopReaction(){
    if(!reaction)return;
    standing=position(performance.now());walking=false;reaction=null;
  }
  function frame(){
    if(editMode)return;
    const now=performance.now(),cat=position(now);
    let pose=null;
    const active=cleaningRuns[0]||reaction;
    if(active&&!walking){
      const elapsed=Math.max(0,now-active.arrives);
      const progress=still() ? 0.7 : (elapsed%reactionCycleMs)/reactionCycleMs;
      const settle=still()?1:Math.min(1,elapsed/450);
      pose={kind:active.kind,itemId:active.itemId,wall:active.wall,progress,settle};
    }
    const movie=playback&&(!playback.templateId||playback.templateId==='movie-night');
    const tv=movie?target:poweredTV;
    const movingUnits=new Map();
    if(pose?.kind==='robot_vacuum'&&!still()){
      for(const {item,path} of cleaningRuns.length?cleaningRuns:[{item:target,path:reaction.path}]){
        const step=Math.round(path.length*(1-Math.cos(2*Math.PI*pose.progress))/2);
        if(step){
          const body={...item,x:item.x+path.dx*step,y:item.y+path.dy*step};
          if(M.products[item.k].hasDock)body.robotPart='mobile';
          movingUnits.set(item.id,body);
        }
      }
    }
    const movingRobot=movingUnits.get(target?.id)||null;
    const tvLoc=target&&M.place(room(),tone(),movingRobot||target);
    const destination=walking&&(seat?sofaPoint(seat):standing);
    const dx=destination?destination.x-start.x:tvLoc?tvLoc.x+tvLoc.s.w/2-cat.x:0;
    const dy=destination?destination.y-start.y:tvLoc?tvLoc.y+tvLoc.s.h/3-cat.y:0;
    let facingLeft=dx<0;
    if(pose?.kind==='robot_vacuum'&&!cleaningRuns.length){
      facingLeft=reaction.facingLeft;
      pose.watchingCleaner=true;
      // Sample the continuous patrol for the eyes and head while the cleaner is drawn on whole pixels.
      const path=reaction.path;
      const offset=still()?0:path.length*(1-Math.cos(2*Math.PI*pose.progress))/2;
      pose.gazeX=(facingLeft?-1:1)*(path.dx-path.dy)*offset/4;
      pose.gazeY=-(path.dx+path.dy)*offset/6;
    }else if(pose?.kind==='robot_vacuum'){
      const gx=movingRobot?movingRobot.x-target.x:0,gy=movingRobot?movingRobot.y-target.y:0;
      pose.gazeX=Math.max(-2,Math.min(2,(gx-gy)*(dx<0?-1:1)/3));
      pose.gazeY=Math.max(-1,Math.min(1,-(gx+gy)/5));
    }
    const mist=reaction?.kind==='humidifier'?{itemId:reaction.itemId,
      phase:still() ? .42 : ((now-started)%2800)/2800}:null;
    return {cat,reaction:pose,mist,movingRobot,movingUnits,sleepBed:!walking&&sleepBed?sleepBed.id:null,
      tucked:still()?1:Math.max(0,Math.min(1,(now-started-approachMs)/450)),focusedProduct:panel==='product'?target?.id:null,
      tapGlow:still()?0:Math.max(0,1-(now-productTapTime)/200),depth:cat.depth,seat:!walking&&seat?seat.id:null,
      time:still()?0:now,walking,facingAway:dy<0,facingLeft,
      facingSide:walking?Math.abs(dx)>Math.abs(dy)*.65:Math.abs(dx)>12,tv:tv?.id,
      appliances:recipeEffects,playing:!!movie||!!poweredTV,
      dim:!!playback?.bindings['light-dim']||(playback?.custom&&Object.values(recipeEffects).some(op=>op==='light-off'||op==='light-dim')),
      lampLit:lampOn||!!playback?.bindings['light-dim'],
      curtain:!!movie&&!my};
  }
  function clearScene(){
    sleepBed=null;
    furniture=composerFurniture=movieFurniture=null;
    cleaningRuns=[];
    if(raf)cancelAnimationFrame(raf);raf=0;walking=false;standing=start=seat=target=playback=reaction=null;
    poweredTV=null;
    offer?.disconnect();offer=null;offeredTarget=null;skipped=false;sceneBeforeMovie=null;
  }
  function reset(){
    clearScene();recipe=null;recipeBindings={};recipeEffects={};lampOn=false;panel='idle';bindings={};render();
  }
  function action(text,fn,primary=false,container=$('lifeActions')){
    const b=document.createElement('button');b.type='button';b.textContent=text;
    if(primary)b.className='primary';
    b.onclick=()=>{try{fn()}catch(e){if($('batch').open)$('batchStatus').textContent=e.message;else notice(e.message)}};
    container.append(b);return b;
  }
  function show(title,detail=''){$('lifeTitle').textContent=title;$('lifeDetail').textContent=detail}
  function setPanel(next){
    if(next!=='applianceConfig'&&next!=='product')stopReaction();
    panel=next;render();draw();
    if(poweredTV&&!still())animate();
  }
  function toggleEdit(){
    if(readOnly||gestureActive())return;
    clearScene();panel='idle';editMode=!editMode;select();drawerOpen(false);
    render();refresh();home();
  }
  function prepare(){
    if(!sample)return;
    if(!hasHome())model.update(s=>{
      s.registeredTvIds=tvCatalog().map(d=>d.id);
      s.myFixtureId='sample-home-v1';s.myLayout['tv-slot']='my-tv-1';s.myLayout['light-slot']='my-light-1';
    });
    const starter=[[model.demoModels.tvset,1,49,1],['floor_lamp',21,49,0],['sofa',34,48,1]];
    for(const [k,x,y,f] of starter){
      if(list().some(o=>k===model.demoModels.tvset?isTV(o):o.k===k))continue;
      const o={id:id(),k,x,y,f,e:0};if(k==='sofa')o.turn=1;
      if(findSpace(o)){if(isAppliance(k))bindUnit(o);list().push(o)}
    }
    identifyDevices(list());for(const d of liveTVs())ensureTV(d);
    save();inventory();refresh();clearConnectLink();if(recipe)openRecipe(recipe);else connect();
  }
  function connect(attachTo=null){
    movieFurniture=attachTo;
    bindings={...(saved()?.bindings||{})};setPanel('connect');
  }
  function clearConnectLink(){
    const entry=new URL(location.href);
    if(!entry.searchParams.has('connect'))return;
    entry.searchParams.delete('connect');entry.searchParams.delete('template');
    history.replaceState(history.state,'',entry);
  }
  function startMovie(from=panel){
    const editing=from==='connect'||from==='repair';
    if(my&&!editing&&from!=='product'&&needsRepair()){beginRepair();return}
    const chosen={...(editing?bindings:saved()?.bindings||{})};
    if(my&&!editing&&(from==='product'||!saved())){
      const options=availableTVs();
      const choice=from==='product'?target?.deviceId:(options.length===1?options[0].id:null);
      if(!available(choice)){connect();return}
      chosen['tv-on']=choice;if(!saved())chosen['light-dim']=model.state.myLayout['light-slot'];
    }
    const device=my&&liveTVs().find(d=>d.id===chosen['tv-on']);
    const newPlacement=my&&editing&&device&&!screenFor(device.id);
    if(friend&&from==='friendMovie'){
      previewFurniture=[{id:id(),k:model.demoModels.tvset,x:1,y:49,f:1,e:0},{id:id(),k:'floor_lamp',x:21,y:49,f:0,e:0}];
      list().push(...previewFurniture);refresh();
    }
    const tv=my?(newPlacement?planTV(device):screenFor(chosen['tv-on'])):
      (isTV(target)&&visible(target)?target:list().find(o=>isTV(o)&&visible(o)));
    if(!tv){notice('배치 편집에서 TV를 놓아 주세요.');return}
    // Preserve the saved optional actions during TV repair, even in a room without a lamp.
    const repaired=from==='repair'?{...saved(),bindings:{...saved().bindings,'tv-on':chosen['tv-on']}}:null;
    if(!hasLamp())delete chosen['light-dim'];
    const result=my?model.routine(chosen):{bindings:{'tv-on':true,'light-dim':hasLamp(),'curtain-close':true}};
    if(repaired){
      persistRoutine(repaired);from='idle';log('routine_reconnected',savedSource());
    }
    if(newPlacement){placeTV(tv,device.id);save();refresh()}
    previousPanel=from;
    if(!samplePreview)history.pushState({...history.state,dotMovie:true},'');
    const replay=my&&['idle','furniture'].includes(from);
    const origin=replay?savedSource():source;
    if(!my&&from==='product')log('routine_opened');
    stopReaction();
    sceneBeforeMovie={target,seat,standing,start,walking,elapsed:performance.now()-started};
    watch(tv,from==='furniture'&&furniture?.k==='sofa'?furniture:nearbySofa(tv));
    playback=result;panel='playing';render();draw();if(!still())animate();
    remember(model.movieTemplate);
    if(replay){if(from==='idle')log('routine_reopened',origin);log('routine_replayed',origin)}
    log('preview_opened',origin);
  }
  function leaveMovie(destination=previousPanel){
    const draft=destination==='composer'&&playback?.custom?playback:null;
    if(destination==='connect'&&playback)bindings={...playback.bindings};
    playback=null;skipped=false;recipeEffects={};cleaningRuns=[];sleepBed=null;
    if(previewFurniture.length){
      for(const item of previewFurniture){
        const index=list().indexOf(item);if(index>=0)list().splice(index,1);
      }
      previewFurniture=[];refresh();
    }
    if(sceneBeforeMovie){
      ({target,seat,standing,start,walking}=sceneBeforeMovie);
      if(sceneBeforeMovie.reaction&&destination===previousPanel&&!returnToBag){
        reaction={...sceneBeforeMovie.reaction,arrives:performance.now()+sceneBeforeMovie.arrivalOffset};
      }
      started=performance.now()-sceneBeforeMovie.elapsed;sceneBeforeMovie=null;
      if(still())walking=false;
      if(walking)animate();
    }
    const backToBag=returnToBag&&destination===previousPanel;
    returnToBag=false;
    panel=backToBag||draft?'idle':destination;render();draw();
    if((poweredTV||reaction)&&!still())animate();
    if(backToBag)openBag();
    if(draft)openComposer(draft,composerFurniture);
  }
  let afterBack=null;
  function closeMovie(destination=previousPanel){
    if(samplePreview){
      const from=params.get('returnSpace')==='my'?'my':'dream';
      const ref=document.referrer&&new URL(document.referrer);
      if(ref&&ref.origin===location.origin&&ref.searchParams.get('inventory')==='1')history.back();
      else location.replace(inventoryUrl(from,{inventory:'1'}));
      return;
    }
    if(history.state?.dotMovie){afterBack=destination;history.back()}
    else leaveMovie(destination);
  }
  window.addEventListener('popstate',()=>{
    if(playback){leaveMovie(afterBack||previousPanel);afterBack=null}
  });
  function persistRoutine(record){model.saveRoutines([record])}
  function storeRoutine(){
    if(!playback)return;
    const verified=model.routine(playback.bindings);
    if(saved()&&!confirm('내 루틴의 영화 보기 연결을 바꿀까요?'))return;
    persistRoutine(verified);
    const item=previousPanel==='connect'?movieFurniture:null;
    log('routine_saved');
    if(item&&list().includes(item)){
      furniture=item;
      if(!linkSavedRoutine(item,verified)){closeMovie('idle');return}
      closeMovie('furniture');
    }else closeMovie('idle');
    notice('내 루틴에 영화 보기를 저장했어요.');
  }
  function tap(o){
    if(playback||menu)return;
    productTapTime=performance.now();
    if(panel==='product'&&reaction&&reaction.itemId===o?.id)return;
    stopReaction();
    poweredTV=isTV(o)?o:null;
    const kind=tapKind(baseKey(o?.k))||groupFor(o?.k)||(o?.k==='floor_lamp'?'lamp':null);
    if(kind){
      approachAppliance(o,kind);
      setPanel('product');
      return;
    }
    if(isTV(o)){
      if(my&&!hasHome()){setPanel('setup');return}
      watch(o);setPanel('product');return;
    }
    if(o&&M.products[o.k].catalogFamily){
      standing=position(performance.now());seat=null;walking=false;target=o;setPanel('product');return;
    }
    if(friend){
      if(o?.k==='sofa'){
        if(panel!=='friendMovie')log('routine_opened');
        setPanel('friendMovie');
      }else setPanel('idle');
      return;
    }
    standing=position(performance.now());seat=target=null;walking=false;
    if(my&&isFurniture(o)){
      furniture=o;
      if(!hasHome()){setPanel('setup');return}
      if(o.routineIds?.includes('movie-night')&&saved())log('routine_reopened',savedSource());
      setPanel('furniture');return;
    }
    furniture=null;setPanel('idle');
  }
  function beginRepair(){
    bindings={...saved().bindings};delete bindings['tv-on'];setPanel('repair');
  }
  function tvPicker(label){
    const field=document.createElement('label'),picker=document.createElement('select');
    field.className='tv-picker';field.append(label,picker);
    picker.add(new Option('TV 선택',''));
    for(const d of liveTVs()){
      picker.add(new Option(d.name+(screenFor(d.id)?'':' · 방에 놓기'),d.id));
    }
    picker.value=bindings['tv-on']||'';
    picker.onchange=()=>{
      bindings['tv-on']=picker.value;render();$('lifeActions').querySelector('select')?.focus({preventScroll:true});
    };
    $('lifeActions').append(field);
  }
  function applianceOptions(a){
    if(my&&!hasHome())return [];
    return list().filter(o=>groupFor(o.k)===a.kind&&visible(o)).map(o=>({
      item:o,id:my?o.deviceId:String(o.id),name:(my&&owned(o.k).find(d=>d.id===o.deviceId)?.name)||M.products[o.k].n
    })).filter(d=>d.id);
  }
  function openRecipe(t,item=null){
    recipe=t;
    if(my&&!hasHome()){setPanel('setup');return}
    recipeBindings={...(my?savedRecipe(t)?.bindings:{})};
    for(const a of t.actions){
      const options=applianceOptions(a);
      const tapped=options.find(d=>d.item===item);
      if(tapped)recipeBindings[a.actionId]=tapped.id;
      else if(!my&&options.length)recipeBindings[a.actionId]=options[0].id;
      else if(!options.some(d=>d.id===recipeBindings[a.actionId])){
        delete recipeBindings[a.actionId];
        if(a.required&&options.length===1)recipeBindings[a.actionId]=options[0].id;
      }
    }
    if(item&&!my)model.logObservation('routine_opened',space,source,t.id);
    setPanel('applianceConfig');
  }
  function addDemoAppliance(a){
    const k=model.registeredAppliances().find(d=>groupFor(d.k)===a.kind&&canAdd(d.k))?.k;
    if(!my||!k)throw Error('연결할 등록 기기가 없어요.');
    const o={id:id(),k,x:Math.round(M.roomData(room()).W/2),y:18,f:0,e:0};
    if(!findSpace(o))throw Error('이 방에 기기를 배치할 빈자리가 없어요.');
    bindUnit(o);list().push(o);
    if(!save()){list().pop();throw Error('가전 배치를 저장할 수 없어요. 저장 공간을 확인해 주세요.')}
    refresh();
    return o.deviceId;
  }
  function placeAppliance(a){
    recipeBindings[a.actionId]=addDemoAppliance(a);setPanel('applianceConfig');
  }
  function pickAppliance(a){
    const options=applianceOptions(a);
    const label=groups[a.kind].label;
    if(!options.length){
      if(model.registeredAppliances().some(d=>groupFor(d.k)===a.kind&&canAdd(d.k)))action((sample?'체험용 ':'등록 ')+label+' 배치',()=>placeAppliance(a));
      else $('lifeDetail').textContent+=' · '+label+' 연결할 기기 없음';
      return;
    }
    const field=document.createElement('label'),picker=document.createElement('select');
    field.className='tv-picker';field.append(label+(a.required?' · 필수':' · 선택'),picker);
    picker.add(new Option(a.required?'기기 선택':'제외',''));
    for(const [index,d] of options.entries()){
      picker.add(new Option(d.name+(options.length>1?' · '+(index+1):''),d.id));
    }
    picker.value=recipeBindings[a.actionId]||'';
    picker.onchange=()=>{
      if(picker.value)recipeBindings[a.actionId]=picker.value;
      else delete recipeBindings[a.actionId];
      $('recipePreview').disabled=!recipeReady();
    };
    $('lifeActions').append(field);
  }
  function recipeReady(){
    return recipe.actions.every(a=>!a.required||applianceOptions(a).some(d=>d.id===recipeBindings[a.actionId]));
  }
  function beginCleaningScene(effects){
    const robots=list().filter(o=>effects[o.id]==='robot_vacuum');
    if(!robots.length)return;
    const now=performance.now(),current=position(now);
    sceneBeforeMovie={target,seat,standing,start,walking,elapsed:now-started,reaction,
      arrivalOffset:reaction?reaction.arrives-now:0};
    reaction=null;
    target=robots[0];start=current;started=now;
    const reserved=[];
    cleaningRuns=robots.map(item=>{
      const path=robotPath(item,null,reserved),{w,d}=M.dims(item);
      const dx=path.length*path.dx,dy=path.length*path.dy;
      reserved.push({x:item.x+Math.min(0,dx),y:item.y+Math.min(0,dy),w:w+Math.abs(dx),d:d+Math.abs(dy)});
      return {item,itemId:item.id,path,kind:'robot_vacuum'};
    });
    const clearance=cleanerClearance(cleaningRuns);
    seat=nearbySofa(target);
    if(seat){
      const cushion=sofaPoint(seat);
      if(!clearance(cushion,seat)||!clearApproach(start,cushion,clearance,seat))seat=null;
    }
    standing=seat?null:standingPoint(target,'cleaning',cleaningRuns[0].path,clearance);
    const end=seat?sofaPoint(seat):standing;
    walking=!still()&&Math.hypot(end.x-current.x,end.y-current.y)>1;
    for(const run of cleaningRuns)run.arrives=now+(walking?approachMs:0);
  }
  function playRecipe(from){
    const record=model.routine(recipeBindings,recipe,applianceOptions);
    const effects={};
    for(const a of recipe.actions){
      const d=applianceOptions(a).find(d=>d.id===record.bindings[a.actionId]);
      if(d)effects[d.item.id]=a.kind;
    }
    if(!samplePreview)history.pushState({...history.state,dotMovie:true},'');
    beginCleaningScene(effects);
    previousPanel=from;playback=record;recipeEffects=effects;setPanel('appliancePlaying');
    if(!still())animate();
    remember(recipe);
    const origin=from==='idle'?model.savedObservationSource(source,recipe.id):source;
    if(from==='idle')model.logObservation('routine_replayed',space,origin,recipe.id);
    model.logObservation('preview_opened',space,origin,recipe.id);
  }
  function runSavedRecipe(t,from='idle'){
    recipe=t;recipeBindings={...savedRecipe(t).bindings};
    if(!recipeReady()){openRecipe(t);notice('필수 기기를 다시 연결해 주세요.');return}
    playRecipe(from);
  }
  function shortcut(label,detail,run){
    const b=action(label,run);
    b.className='routine-card';
    b.setAttribute('aria-label',label);
    b.setAttribute('aria-describedby',detail.id);
    b.append(detail);
  }
  function renderRoutineShelf(movie,recipes,custom){
    const tools=$('routineTools');
    const broken=movie&&needsRepair();
    const empty=!movie&&!recipes.length&&!custom.length;
    show('내 루틴',movie?nameOf(movie.bindings['tv-on'])+(broken?' 재연결 필요':' 연결됨'):empty?'등록 기기의 동작을 골라 첫 루틴을 만들어 보세요.':'');
    if(!broken)action(movie?'연결 설정':'루틴 연결',connect,false,tools);
    action('루틴 추가',openBatch,false,tools);
    action('루틴 만들기',()=>openComposer(),false,tools);
    if(movie){
      shortcut(broken?'TV 다시 연결':'영화 보기',$('lifeDetail'),broken?beginRepair:()=>startMovie('idle'));
    }
    for(const t of recipes){
      const record=savedRecipe(t);
      const connected=t.actions.filter(a=>applianceOptions(a).some(d=>d.id===record.bindings[a.actionId]));
      const detail=document.createElement('small');detail.id='devices-'+t.id;
      detail.textContent=t.actions.some(a=>a.required&&!connected.includes(a))
        ?'기기 재연결 필요':connected.map(a=>groups[a.kind].label).join(' · ');
      shortcut(t.name,detail,()=>runSavedRecipe(t));
    }
    for(const record of custom){
      const detail=document.createElement('small');detail.id='devices-'+record.templateId;
      const ready=customReady(record);
      detail.textContent=ready?record.actions.map(a=>a.label).join(' · '):'기기 재연결 필요';
      shortcut(routineName(record),detail,()=>runCustom(record,'idle'));
    }
  }
  function customSteps(record){
    return record.actions.map(a=>({deviceId:record.bindings[a.actionId],operation:a.operation}));
  }
  function customReady(record,devices=model.registeredAppliances()){
    return customSteps(record).every(s=>devices.some(d=>d.id===s.deviceId&&model.customOptions(d).some(a=>a.actionId===s.operation)));
  }
  function routineName(record,records=model.state.savedRoutines){
    if(record.custom){
      const matches=records.filter(r=>r.custom&&r.name===record.name);
      const index=matches.findIndex(r=>r.templateId===record.templateId);
      if(matches.length>1&&index>=0)return record.name+' ('+(index+1)+')';
    }
    return record.name||batchTemplates.find(t=>t.id===record.templateId)?.name||record.templateId;
  }
  function runCustom(record,from,attachTo=null){
    if(customReady(record))playCustom(record,from);
    else openComposer(record,attachTo);
  }
  function saveFurnitureLinks(item,ids){
    const old=item.routineIds,before=JSON.stringify(list());item.routineIds=ids;
    if(save()){
      if(before!==JSON.stringify(list()))checkpoint(before);
      return true;
    }
    if(old===undefined)delete item.routineIds;else item.routineIds=old;
    notice('가구 연결을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
    return false;
  }
  function linkSavedRoutine(item,record){
    return saveFurnitureLinks(item,[...new Set([...(item.routineIds||[]),record.templateId])]);
  }
  function configureFurniture(item){
    const dialog=$('furnitureLinks'),rows=$('furnitureChoices');
    $('furnitureLinksTitle').textContent=M.products[item.k].n+' · 루틴 연결';
    rows.replaceChildren();
    for(const record of model.state.savedRoutines){
      const label=document.createElement('label'),box=document.createElement('input');
      label.className='batch-choice';box.type='checkbox';box.value=record.templateId;
      box.checked=item.routineIds?.includes(record.templateId)||false;
      label.append(box,routineName(record));rows.append(label);
    }
    $('applyFurnitureLinks').onclick=()=>{
      const ids=Array.from(rows.querySelectorAll('input:checked'),b=>b.value);
      if(!saveFurnitureLinks(item,ids))return;
      dialog.close();setPanel('furniture');
    };
    dialog.showModal();
  }
  function renderFurniture(){
    const records=model.state.savedRoutines;
    const linked=records.filter(r=>furniture.routineIds?.includes(r.templateId));
    const movie=linked.find(r=>r.templateId===model.movieTemplate.id);
    const detail=movie?nameOf(movie.bindings['tv-on'])+' · '+(movie.bindings['light-dim']?'조명 30%':'조명 제외')+' · 커튼 제외':
      linked.length?'실행할 루틴을 선택하세요.':'이 가구에 연결된 루틴이 없어요.';
    show(M.products[furniture.k].n,detail);
    for(const record of linked){
      action(routineName(record),()=>{
        if(record.custom){
          runCustom(record,'furniture',furniture);
        }else if(record.templateId===model.movieTemplate.id)startMovie('furniture');
        else runSavedRecipe(templates.find(t=>t.id===record.templateId),'furniture');
      },true);
    }
    if(records.length)action('루틴 연결 설정',()=>configureFurniture(furniture));
    if(furniture.k==='sofa'&&!saved())action('영화 보기 설정',()=>connect(furniture));
    if(furniture.k==='bed'&&!linked.some(r=>r.name==='취침 모드'))
      action('취침 모드 만들기',()=>openComposer(null,furniture));
    else action('새 루틴 만들기',()=>openComposer(null,furniture));
    action('닫기',()=>tap(null));
  }
  function openComposer(record=null,attachTo=null){
    composerFurniture=attachTo;
    const dialog=$('composer'),rows=$('customDevices'),name=$('customName'),submit=$('customPreview');
    const steps=record?customSteps(record):[],fields=[];
    $('composerTitle').textContent=record?'루틴 수정':'루틴 만들기';
    const bedtime=!record&&attachTo?.k==='bed';
    name.value=record?.name||(bedtime?'취침 모드':'');rows.replaceChildren();
    let suggestedLight=false;
    const selected=()=>fields.filter(f=>f.select.value).map(f=>({deviceId:f.deviceId,operation:f.select.value}));
    const update=()=>{
      const count=selected().length;
      submit.disabled=!name.value.trim()||!count;
      $('customStatus').textContent=!fields.length?'지원하는 등록 기기가 없어요.':count?count+'개 동작 선택':'사용할 기기의 동작을 골라 주세요.';
    };
    for(const d of model.registeredAppliances()){
      const options=model.customOptions(d);if(!options.length)continue;
      const label=document.createElement('label'),select=document.createElement('select');
      label.append(d.name||M.products[d.k].n,select);
      select.add(new Option('사용 안 함',''));
      for(const a of options)select.add(new Option(a.label,a.actionId));
      select.value=steps.find(s=>s.deviceId===d.id)?.operation||'';
      if(bedtime&&!suggestedLight&&options.some(a=>a.actionId==='light-off')){
        select.value='light-off';suggestedLight=true;
      }
      select.onchange=update;rows.append(label);fields.push({deviceId:d.id,select});
    }
    name.oninput=update;update();
    if(steps.length>selected().length)$('customStatus').textContent='사용할 수 없는 기기가 있어요. 연결할 동작을 다시 골라 주세요.';
    submit.onclick=()=>{
      try{
        const draft=model.customRoutine(name.value,selected(),record?.templateId);
        if(bedtime||record?.scene==='bedtime')draft.scene='bedtime';
        dialog.close();playCustom(draft,'composer');
      }catch(e){$('customStatus').textContent=e.message}
    };
    dialog.showModal();
  }
  function playCustom(record,from){
    if(from!=='composer')composerFurniture=from==='furniture'?furniture:null;
    const verified=model.customRoutine(record.name,customSteps(record),record.templateId);
    if(record.scene==='bedtime')verified.scene='bedtime';
    recipeEffects={};
    for(const a of verified.actions){
      const item=list().find(o=>o.deviceId===verified.bindings[a.actionId]&&visible(o));
      if(item)recipeEffects[item.id]=groups[a.kind]?a.kind:a.operation;
    }
    history.pushState({...history.state,dotMovie:true},'');
    const linkedBed=composerFurniture?.k==='bed'?composerFurniture:list().find(o=>o.k==='bed'&&o.routineIds?.includes(record.templateId));
    const bedtime=linkedBed&&(verified.scene==='bedtime'||record.name==='취침 모드')&&
      verified.actions.some(a=>a.operation==='light-off'||a.operation==='light-dim');
    const now=performance.now(),current=position(now);
    beginCleaningScene(recipeEffects);
    if(bedtime){
      sceneBeforeMovie??={target,seat,standing,start,walking,elapsed:now-started,reaction,arrivalOffset:reaction?reaction.arrives-now:0};
      sleepBed=linkedBed;seat=null;target=linkedBed;reaction=null;start=current;started=now;
      standing=M.bedPoint(room(),tone(),linkedBed);
      walking=!still()&&Math.hypot(current.x-standing.x,current.y-standing.y)>1;
    }
    previousPanel=from;playback=verified;setPanel('customPlaying');if(!still())animate();
  }
  // Each selected template owns a draft. Only the final save writes routine records.
  const batchTemplates=[model.movieTemplate,...templates];
  const movieActions={
    tv:'TV 켜기',light:'조명 30%',curtain:'커튼 닫기'
  };
  const shownClues=new Set();
  let clueTimer;
  function supportsPlacement(o,a){
    if(a.kind==='tv')return isTV(o);
    if(a.kind==='light')return o.k==='floor_lamp';
    if(a.kind==='curtain')return o.k==='window';
    return groupFor(o.k)===a.kind;
  }
  function placementClue(added){
    if(space!=='dream'||readOnly)return;
    const placed=list().filter(visible),before=placed.filter(o=>o!==added),messages=[];
    for(const t of batchTemplates){
      const required=t.actions.filter(a=>a.required);
      if(!required.every(a=>placed.some(o=>supportsPlacement(o,a))))continue;
      const justOpened=!required.every(a=>before.some(o=>supportsPlacement(o,a)));
      const labels=[];
      for(const a of t.actions){
        if(!placed.some(o=>supportsPlacement(o,a))||(!justOpened&&before.some(o=>supportsPlacement(o,a))))continue;
        const key='lg-miniroom.placement-clue.'+room()+'.'+t.id+'.'+a.actionId;
        if(shownClues.has(key))continue;
        try{if(localStorage.getItem(key))continue}catch{/* Session-only deduplication is still available. */}
        shownClues.add(key);
        try{localStorage.setItem(key,'1')}catch{/* Keep the hint once per open session. */}
        labels.push(a.kind==='light'?'조명 밝기 30%':batchLabel(a));
      }
      if(labels.length)messages.push(t.name+(justOpened?' 가능 · ':'에 추가 · ')+labels.join(', '));
    }
    if(messages.length){
      $('comboHint').textContent=messages.join(' / ');
      clearTimeout(clueTimer);clueTimer=setTimeout(()=>$('comboHint').textContent='',4500);
    }
  }
  function batchLabel(a){
    return movieActions[a.kind]||groups[a.kind].label+' '+a.label;
  }
  function batchOptions(a){
    if(groups[a.kind])return applianceOptions(a);
    if(a.kind==='light'&&!hasLamp())return [];
    return model.candidates(a);
  }
  function batchCompatible(a,id){
    return batchOptions(a).some(d=>d.id===id)&&(a.kind!=='tv'||available(id));
  }
  function inventoryUrl(which,options={}){
    const url=new URL(route(which));
    for(const [k,v] of Object.entries(options))url.searchParams.set(k,v);
    return url;
  }
  function connectFromInventory(t){
    recipe=t===model.movieTemplate?null:t;
    if(model.homeSource==='unavailable'){setPanel('idle');return}
    if(!hasHome()){setPanel('setup');return}
    if(t===model.movieTemplate){
      if(saved()&&needsRepair())beginRepair();else connect();
    }else openRecipe(t);
  }
  let returnToBag=false;
  function previewFromInventory(t){
    const device=list().find(o=>visible(o)&&(t===model.movieTemplate?isTV(o):groupFor(o.k)===t.actions[0].kind));
    if(!my&&device){
      if(t===model.movieTemplate)startMovie('product');
      else{openRecipe(t,device);playRecipe('applianceConfig')}
      returnToBag=!!playback;return;
    }
    const opener=new URL(location.href);opener.searchParams.set('inventory','1');history.replaceState(history.state,'',opener);
    location.assign(inventoryUrl('example',{previewTemplate:t.id,returnSpace:space,source:model.discovery(t.id)||source}));
  }
  function startSamplePreview(){
    const t=batchTemplates.find(t=>t.id===params.get('previewTemplate'));
    if(!t)return;
    if(t===model.movieTemplate){startMovie('friendMovie');return}
    // This is the read-only sample layout. Fill only the devices needed for this demonstration.
    for(const a of t.actions){
      if(applianceOptions(a).length)continue;
      const k=Object.values(model.demoModels).find(key=>ProductCatalog.hasModel(key)&&groupFor(key)===a.kind);
      if(!k){if(!a.required)continue;setPanel('idle');notice('이 루틴에 맞는 DB 제품이 없어요.');return}
      const o={id:id(),k,x:a.required?15:45,y:30,f:0,e:0};
      if(!findSpace(o)){setPanel('idle');return}
      list().push(o);
    }
    refresh();openRecipe(t);playRecipe('applianceConfig');
  }
  function openBag(){
    const dialog=$('routineBag'),rows=$('bagRows');
    rows.replaceChildren();
    const loading=document.createElement('p');loading.textContent='루틴을 불러오는 중이에요.';rows.append(loading);
    if(!dialog.open)dialog.showModal();
    const request=Symbol();bagRequest=request;
    async function drawRows(){
      let records,placed,registered=[],unknown=false;
      try{
        if(my){
          records=model.homeSource==='unavailable'?[]:model.state.savedRoutines;
          unknown=model.homeSource==='unavailable';
          placed=list().filter(visible);
          registered=model.registeredAppliances();
        }else{
          const snapshot=await model.inventoryHome();
          records=snapshot.records;placed=snapshot.placed;
          registered=snapshot.registered||[];
        }
      }catch{records=[];placed=[];unknown=true}
      if(request!==bagRequest||!dialog.open)return;
      rows.replaceChildren();
      for(const t of batchTemplates){
        const record=records.find(r=>r.templateId===t.id),movie=t===model.movieTemplate;
        const required=t.actions.find(a=>a.required);
        const broken=record&&placed!==null&&!placed.some(o=>o.deviceId===record.bindings[required.actionId]&&
          (movie?isTV(o):groupFor(o.k)===required.kind));
        const known=!!model.discovery(t.id)||!!record;
        const ready=t.actions.filter(a=>a.required).every(a=>list().some(o=>visible(o)&&supportsPlacement(o,a)));
        const section=document.createElement('article'),name=document.createElement('strong'),detail=document.createElement('p');
        name.textContent=t.name;
        const need=movie?'TV':groups[required.kind].label;
        const status=record?(broken?'저장됨 · 재연결 필요':'내 루틴에 저장됨'):(known?'발견함':ready?'체험 가능':'미발견');
        detail.textContent=status+(unknown?' · 저장 상태 확인 불가':'')+' · '+need+' 필수';
        section.append(name,detail);rows.append(section);
        if(known||ready){
          action(known?'다시 미리보기':'미리보기',()=>{
            dialog.close();if(editMode)toggleEdit();previewFromInventory(t);
          },true,section);
        }
        if(known){
          action(record?(broken?'다시 연결':'저장한 연결 보기'):'내 방에 맞추기',()=>{
            dialog.close();if(editMode)toggleEdit();
            if(my)connectFromInventory(t);
            else location.assign(inventoryUrl('my',{inventoryConnect:t.id,source:model.discovery(t.id)||source}));
          },false,section);
        }
      }
      for(const record of records.filter(r=>r.custom)){
        const section=document.createElement('article'),name=document.createElement('strong'),detail=document.createElement('p');
        section.dataset.routineId=record.templateId;
        name.textContent=routineName(record,records);
        const ready=customReady(record,registered);
        const steps=record.actions.map(a=>{
          const device=registered.find(d=>d.id===record.bindings[a.actionId]);
          return (device?.name||'이전 기기')+' · '+a.label;
        });
        detail.textContent=(ready?'내 루틴에 저장됨':'저장됨 · 재연결 필요')+' · '+steps.join(' / ');
        section.append(name,detail);rows.append(section);
        action(ready?(my?'실행':'마이룸에서 실행'):'다시 연결',()=>{
          dialog.close();if(editMode)toggleEdit();
          if(!my){location.assign(inventoryUrl('my',{inventoryRun:record.templateId}));return}
          returnToBag=ready;runCustom(record,'idle');
        },true,section);
      }
    }
    drawRows().catch(()=>{if(request===bagRequest)rows.textContent='인벤토리를 읽지 못했어요. 다시 열어 주세요.'});
  }
  let bagRequest=null;
  function openBatch(){
    if(!my||!hasHome())return;
    const dialog=$('batch'),rows=$('batchList'),status=$('batchStatus'),submit=$('batchSave');
    rows.replaceChildren();status.textContent='';
    const drafts=batchTemplates.map(template=>{
      const original=savedRecipe(template);
      const bindings={...original?.bindings};
      if(!original)for(const a of template.actions.filter(a=>a.required)){
        const options=batchOptions(a);
        if(options.length===1&&batchCompatible(a,options[0].id))bindings[a.actionId]=options[0].id;
      }
      return {template,original,bindings,selected:false};
    });
    function updateStatus(){
      const chosen=drafts.filter(d=>d.selected);
      const missing=chosen.some(d=>d.template.actions.some(a=>a.required&&!batchCompatible(a,d.bindings[a.actionId])));
      submit.disabled=!chosen.length||missing;
      submit.textContent=chosen.length?chosen.length+'개 루틴 저장':'선택한 루틴 저장';
      status.textContent=missing?'필수 기기를 연결해 주세요.':chosen.length?chosen.length+'개 선택됨':'설정할 루틴을 선택하세요.';
    }
    function fieldsFor(d,fields){
      fields.replaceChildren();
      for(const a of d.template.actions){
        const options=batchOptions(a),key=a.actionId,selected=d.bindings[key];
        const labelText=batchLabel(a)+(a.required?' · 필수':' · 선택');
        if(options.length){
          const label=document.createElement('label'),picker=document.createElement('select');
          label.append(labelText,picker);
          picker.add(new Option(a.required?'기기 선택':'제외',''));
          for(const [i,device] of options.entries()){
            const suffix=options.filter(o=>o.name===device.name).length>1?' · '+(i+1):'';
            picker.add(new Option(device.name+suffix,device.id));
          }
          picker.value=options.some(o=>o.id===selected)?selected:'';
          picker.onchange=()=>{
            d.bindings[key]=picker.value;
            if(a.kind==='tv'){fieldsFor(d,fields);fields.querySelector('select')?.focus()}
            updateStatus();
          };
          fields.append(label);
        }else{
          const info=document.createElement('small');
          info.textContent=labelText+(a.kind==='tv'&&sample?' · 방 메뉴에서 체험용 TV를 등록하세요.':' · 연결할 기기 없음');fields.append(info);
        }
        if(groups[a.kind]&&!options.length&&model.registeredAppliances().some(d=>groupFor(d.k)===a.kind&&canAdd(d.k))){
          action((sample?'체험용 ':'등록 ')+groups[a.kind].label+' 배치',()=>{
            d.bindings[key]=addDemoAppliance(a);
            for(const other of drafts.filter(row=>row.selected))fieldsFor(other,$('batch-'+other.template.id));
            updateStatus();
          },false,fields);
        }
        if(a.kind==='tv'&&options.some(o=>o.id===selected)&&!screenFor(selected)){
          action(nameOf(selected)+' 방에 놓기',()=>{
            const tv=planTV(liveTVs().find(o=>o.id===selected));
            if(!tv)throw Error('TV를 배치할 빈자리가 없어요.');
            const inserted=!list().includes(tv),oldId=tv.deviceId;
            placeTV(tv,selected);
            if(!save()){
              if(inserted)list().splice(list().indexOf(tv),1);else tv.deviceId=oldId;
              throw Error('TV 배치를 저장할 수 없어요.');
            }
            refresh();fieldsFor(d,fields);updateStatus();
          },false,fields);
        }
      }
    }
    for(const d of drafts){
      const row=document.createElement('section'),label=document.createElement('label');
      const check=document.createElement('input'),fields=document.createElement('div');
      row.className='batch-row';label.className='batch-choice';fields.className='batch-fields';
      check.type='checkbox';check.setAttribute('aria-label',d.template.name);
      fields.id='batch-'+d.template.id;check.setAttribute('aria-controls',fields.id);
      fields.hidden=true;
      label.append(check,d.template.name);
      if(d.original){const badge=document.createElement('small');badge.textContent='저장됨';label.append(badge)}
      row.append(label,fields);rows.append(row);
      check.onchange=()=>{
        d.selected=check.checked;fields.hidden=!d.selected;
        if(d.selected)fieldsFor(d,fields);
        updateStatus();
      };
    }
    submit.onclick=()=>{
      try{
        const chosen=drafts.filter(d=>d.selected);
        if(!chosen.length)return;
        const records=chosen.map(d=>model.routine(d.bindings,d.template,a=>batchOptions(a).filter(o=>batchCompatible(a,o.id))));
        const replace=chosen.filter(d=>d.original);
        if(replace.length&&!confirm(replace.map(d=>d.template.name).join(', ')+'의 저장된 연결을 갱신할까요?'))return;
        model.saveRoutines(records);
        for(const record of records)model.logObservation('routine_saved',space,source,record.templateId);
        dialog.close();setPanel('idle');notice(records.length+'개 루틴을 저장했어요.');
      }catch(error){status.textContent='저장하지 못했어요. '+error.message}
    };
    updateStatus();dialog.showModal();
  }
  function renderRecipes(){
    if(panel==='recipeList'){
      show('루틴 추가','사용할 가전을 골라 내 방에 맞춰 보세요.');
      if(hasHome())action('여러 루틴 설정',openBatch,true);
      for(const t of templates)action(t.name,()=>openRecipe(t));
      action('닫기',()=>setPanel('idle'));return true;
    }
    if(panel==='applianceConfig'){
      show(recipe.name,recipe.actions.map(a=>groups[a.kind].label+' '+a.label+(a.required?' (필수)':' (선택)')).join(' · '));
      if(my)for(const a of recipe.actions)pickAppliance(a);
      const button=action('미리보기',()=>playRecipe('applianceConfig'),true);
      button.id='recipePreview';button.disabled=!recipeReady();
      if(!my&&!recipeReady())$('lifeDetail').textContent+=' · '+groups[recipe.actions[0].kind].label+' 배치 필요';
      action('닫기',()=>setPanel('idle'));return true;
    }
    if(panel!=='appliancePlaying')return false;
    const summary=recipe.actions.map(a=>{
      const d=applianceOptions(a).find(d=>d.id===playback.bindings[a.actionId]);
      return d?d.name+' '+a.label:groups[a.kind].label+' 제외';
    });
    if(cleaningRuns.length){
      summary.push(seat?'고양이는 소파에서 청소기를 지켜봐요':'고양이는 옆에서 청소기를 지켜봐요');
      if(!cleaningRuns[0].path.length)summary.push(blockedRobotMessage(cleaningRuns[0].item));
    }
    show(recipe.name+' 실행 중',summary.join(' · ')+' · 실제 가전은 작동하지 않아요');
    if(!still())action('연출 건너뛰기',()=>{skipped=true;walking=false;render();draw()});
    action('재생 종료',()=>closeMovie());
    if(my&&previousPanel==='applianceConfig')action('내 루틴에 저장',()=>{
      const record=model.routine(playback.bindings,recipe,applianceOptions);
      if(savedRecipe(recipe)&&!confirm(recipe.name+' 연결을 바꿀까요?'))return;
      persistRoutine(record);model.logObservation('routine_saved',space,source,recipe.id);
      closeMovie('idle');notice(recipe.name+' 루틴을 저장했어요.');
    },true);
    if(!my)action('내 방에 맞추기',()=>location.assign(route('my',true)),true);
    return true;
  }
  function manageTVs(){
    $('menu').close();setPanel('devices');
  }
  function deviceAction(d){
    const registered=model.registeredTVs().includes(d.id);
    action(d.name+(registered?' 등록 해제':' 등록'),()=>{
      const active=model.registeredTVs();
      // A removed TV may still have an old anchor that has since been occupied.
      const returning=!registered&&list().find(o=>isTV(o)&&o.deviceId===d.id);
      const placement=returning&&{...returning};
      if(placement&&!findSpace(placement))return;
      model.update(s=>s.registeredTvIds=registered?active.filter(id=>id!==d.id):[...active,d.id]);
      if(placement&&(returning.x!==placement.x||returning.y!==placement.y)){
        returning.x=placement.x;returning.y=placement.y;delete returning.rotationOrigin;
      }
      if(!registered)ensureTV(d);
      save();select();inventory();refresh();setPanel('devices');
    });
    if(registered&&!screenFor(d.id))action(d.name+' 방에 놓기',()=>{
      ensureTV(d);save();refresh();setPanel('devices');
    });
  }
  function route(which,adapt=false){
    const url=new URL('/editor',location.href);url.searchParams.set('space',which);
    if(params.get('observe')==='1')url.searchParams.set('observe','1');
    if(adapt){url.searchParams.set('connect','1');url.searchParams.set('source',source);
      if(panel==='appliancePlaying'&&recipe)url.searchParams.set('template',recipe.id);
    }
    return url.href;
  }
  const photoPicker=space==='dream'?createPhotoPicker({$,showProducts,isCollectible:model.isCollectibleProduct,
    recognizePhoto:model.recognizePhoto,provider:model.photoProvider}):null;
  const catalog=space==='dream'?ProductCatalog.browser({$,scene:M,tone,collected:model.collected,collect(item,row){
    try{model.collect(item.k,'catalog')}catch(e){$('catalogStatus').textContent=e.message;return}
    inventory();refresh();render();$('catalogBrowse').hidden=true;showCollectionResult(item,row,true);
  }}):null;
  if(catalog)$('openCatalog').onclick=()=>{photoPicker.reset();catalog.gallery();$('library').scrollTop=0};
  if(space==='dream')$('lgCamera').onclick=()=>{
    // The current address (space, room and ?camera) becomes returnTo, so the editor reopens in the same state.
    location.assign(lgCameraBase(params)+'/scan?returnTo='+encodeURIComponent(location.href));
  };
  // Only the model name is read from lgcam_item. Names come from the product DB. Nothing else is kept.
  function cameraReturn(){
    const result=params.get('lgcam');
    if(result===null)return;
    let code=null;
    if(result==='registered'){
      try{const item=JSON.parse(params.get('lgcam_item')||'null');if(typeof item?.modelCode==='string')code=item.modelCode}catch{}
    }
    const url=new URL(location.href);url.searchParams.delete('lgcam');url.searchParams.delete('lgcam_item');
    history.replaceState(history.state,'',url);
    if(space!=='dream')return;
    openLibrary();
    if(result!=='registered')return;
    const key=code&&ProductCatalog.exactModel(code),product=key&&ProductCatalog.restore(M.products,key);
    if(!product){
      $('libraryStatus').textContent=code?'미니룸 제품 DB에 없는 모델입니다 (모델명 '+code.slice(0,60)+')':
        'LG CAMERA 결과에 모델명이 없어요. 다시 찍거나 아래 목록에서 선택하세요.';
      return;
    }
    const already=model.collected(key);
    if(!already){
      try{model.collect(key,'camera')}catch(e){$('libraryStatus').textContent=e.message;return}
      inventory();refresh();render();
    }
    showCollectionResult(product,$('libraryItems'));
    if(already)$('libraryTitle').textContent='이미 수집한 제품';
  }
  function openLibrary(){
    photoPicker?.reset();
    $('collectionResult').hidden=true;$('libraryBrowse').hidden=false;
    $('libraryTitle').textContent=my?'ThinQ 등록 가전':'가전 수집';
    $('libraryNote').textContent=my?(sample?(hasHome()?'체험용 ThinQ 계정에 등록된 가전이에요.':'연결된 계정이 없어요. 체험용 기기로 등록 목록을 확인할 수 있어요.'):
      model.homeSource==='thinq'?'ThinQ 등록 기기 중 제품 DB에서 모델을 확인한 가전이에요.':'ThinQ 등록 목록을 읽지 못했어요.'):'사진은 기기 안에서만 사용해요. 후보 체험에는 예시 제품이 표시돼요.';
    $('collectionPhoto').hidden=my;
    $('openCatalog').hidden=!catalog;$('catalogBrowse').hidden=true;
    $('libraryStatus').textContent='';showProducts();$('library').showModal();
  }
  function showCollectionResult(product,row,fromCatalog=false){
    const dialog=$('library'),offset=row.getBoundingClientRect().top-dialog.getBoundingClientRect().top;
    photoPicker.reset();
    $('libraryBrowse').hidden=true;$('collectionResult').hidden=false;
    $('libraryTitle').textContent='수집 완료';$('collectedName').textContent=product.n;
    $('collectedUse').textContent=productUse(product.k);
    M.thumbnail($('collectedPic'),product.k,tone());
    $('placeCollected').textContent='방에 놓기';
    $('placeCollected').onclick=()=>{
      dialog.close();
      if(!editMode)toggleEdit();
      placeCollected(product.k);
    };
    $('continueCollecting').onclick=()=>{
      if(fromCatalog){$('collectionResult').hidden=true;catalog.resume();return}
      $('collectionResult').hidden=true;$('libraryBrowse').hidden=false;
      $('libraryTitle').textContent='가전 수집';$('libraryStatus').textContent='';
      showProducts([...new Set([...ProductCatalog.representatives(),product.k])]);
      const anchor=$('libraryItems').querySelector('[data-product="'+product.k+'"]');
      dialog.scrollTop+=(anchor.getBoundingClientRect().top-dialog.getBoundingClientRect().top-offset)/(dialog.getBoundingClientRect().width/dialog.offsetWidth);
      anchor.tabIndex=-1;anchor.focus({preventScroll:true});
    };
    $('placeCollected').focus();
  }
  function showProducts(keys){
    const host=$('libraryItems');host.replaceChildren();
    const entries=my?model.registeredAppliances().filter(d=>ProductCatalog.hasModel(d.k)):
      (keys||ProductCatalog.representatives()).filter(ProductCatalog.hasModel).map(k=>ProductCatalog.restore(M.products,k));
    for(const d of entries){
      if(ProductCatalog.componentOnly(d.k))continue;
      const row=document.createElement('div'),pic=document.createElement('canvas'),label=document.createElement('span');
      pic.width=40;pic.height=36;pic.setAttribute('aria-hidden','true');
      if(M.products[d.k])M.thumbnail(pic,d.k,tone());
      label.textContent=d.name||M.products[d.k].n;
      row.dataset.product=d.k||'';row.append(pic,label);host.append(row);
      if(!M.products[d.k])label.append(' · 배치 미지원');
      if(!my){
        const name=label.textContent,role=document.createElement('small');
        role.textContent=productUse(d.k);label.append(role);
        const button=action(model.collected(d.k)?'수집 완료':'수집',()=>{
          const selection=photoPicker.selection(d.k);
          try{model.collect(d.k,selection?'photo':'catalog',selection)}
          catch(e){$('libraryStatus').textContent=e.message;return}
          inventory();refresh();render();showCollectionResult(d,row);
        },false,row);
        button.disabled=model.collected(d.k);button.setAttribute('aria-label',name+' 수집');
      }
    }
    if(my&&!entries.length&&hasHome())host.textContent='제품 DB와 일치하는 등록 모델이 없어요.';
    if(my&&!sample)action('목록 새로고침',()=>location.reload(),false,host);
  }
  function render(){
    $('living').classList.toggle('model-card',panel==='product'&&!editMode);
    offer?.disconnect();offer=null;
    if(!((friend&&panel==='idle')||(!readOnly&&!my&&!editMode&&panel==='product'&&isTV(target))))offeredTarget=null;
    for(const b of $('rooms').children)b.disabled=readOnly||!!playback;
    for(const b of document.querySelectorAll('[data-tone]'))b.disabled=readOnly;
    $('routineBagButton').hidden=readOnly;$('routineBagButton').disabled=!!playback;
    $('editMode').hidden=readOnly;$('saveFile').hidden=readOnly;
    $('libraryButton').hidden=readOnly;$('libraryButton').disabled=!!playback;
    $('libraryButton').textContent=my?'등록 가전':'가전 수집';
    $('friendRoom').href=route('example');$('mini').href=route('menu');
    $('manageTVs').hidden=!my||!sample||!hasHome()||!!playback||editMode;
    $('spaces').hidden=false;$('friendRoom').hidden=friend;$('mini').hidden=menu;
    $('dreamLink').href=route('dream');$('myLink').href=route('my');
    if(!readOnly)$(my?'myLink':'dreamLink').setAttribute('aria-current','page');
    $('editMode').textContent=editMode?'배치 완료':'배치 편집';$('editMode').disabled=!!playback||(my&&model.homeSource==='unavailable');
    document.body.classList.toggle('visiting',!editMode);$('living').hidden=editMode;
    for(const el of [$('reset'),$('clear'),$('openFile')])el.hidden=!editMode;
    const detail=$('lifeDetail'),actions=$('lifeActions'),tools=$('routineTools');
    if(detail.parentElement!==$('living'))actions.before(detail);
    actions.replaceChildren();tools.replaceChildren();
    const movie=saved(),recipes=templates.filter(savedRecipe);
    const custom=model.state.savedRoutines.filter(r=>r.custom===true);
    const shelf=my&&hasHome()&&!editMode&&panel==='idle';
    $('living').classList.toggle('browse-card',(!readOnly||compareWashers)&&!editMode&&(!my||hasHome())&&
      (panel==='idle'||panel==='product'||panel==='furniture'));
    const quick=my&&panel==='playing'&&previousPanel==='idle';
    tools.hidden=!shelf;
    $('living').classList.toggle('routine-shelf',shelf);
    $('living').classList.toggle('routine-footer',quick);
    $('living').classList.toggle('appliance-panel',panel.startsWith('appliance')||panel==='recipeList'||
      (my&&panel==='idle'&&templates.some(savedRecipe)));
    if(shelf){renderRoutineShelf(movie,recipes,custom);return}
    if(editMode)return;
    if(menu){
      show('LG 미니룸');
      action('드림룸 들어가기',()=>{log('miniroom_open');location.assign(route('dream'))},true).id='enter';
      action('예시 친구 방',()=>location.assign(route('example')));
      return;
    }
    if(compareWashers&&panel==='idle'){
      show('세탁기 모델 비교','제품을 눌러 모델명과 사진을 확인하세요.');return;
    }
    if(friend&&panel==='idle'){
      show('예시 친구 방','소파에 영화 보기 루틴이 있어요.');
      observeOffer($('lifeDetail'),'example-sofa');
      return;
    }
    if(panel==='friendMovie'){
      show('영화 보기','TV 켜기 · 조명 30% · 커튼 닫기');
      action('미리보기',()=>startMovie());
      action('내 방에 맞추기',()=>location.assign(route('my',true)),true);
      action('닫기',()=>setPanel('idle'));return;
    }
    if(samplePreview&&playback){
      show('예시 방 · '+(recipe?.name||model.movieTemplate.name),'가상 미리보기 · 실제 가전은 작동하지 않아요');
      action('인벤토리로 돌아가기',()=>closeMovie(),true);
      action('내 방에 맞추기',()=>location.assign(inventoryUrl('my',{inventoryConnect:recipe?.id||model.movieTemplate.id,source})));
      return;
    }
    if(panel==='customPlaying'){
      const record=playback,devices=model.registeredAppliances();
      const results=record.actions.map(a=>{
        const d=devices.find(d=>d.id===record.bindings[a.actionId]);
        const placed=list().some(o=>o.deviceId===d.id&&visible(o));
        const light=placed&&a.kind==='light'?' ('+(lampOn?'100%':'0%')+' → '+a.value+'%)':'';
        return (d.name||M.products[d.k].n)+' '+a.label+light+(placed?'':' (이 방에 미배치)');
      });
      show(model.state.savedRoutines.some(r=>r.templateId===record.templateId)?routineName(record):record.name,results.join(' · ')+' · 실제 가전은 작동하지 않아요');
      if(previousPanel==='composer')action('내 루틴에 저장',()=>{
        persistRoutine(record);
        const item=composerFurniture;
        if(item&&list().includes(item)){
          if(!linkSavedRoutine(item,record)){
            closeMovie('idle');return;
          }
          furniture=item;
        }
        closeMovie(item?'furniture':'idle');notice(record.name+' 루틴을 저장했어요.');
      },true);
      action('동작 수정',()=>closeMovie('composer'));
      action('재생 종료',()=>closeMovie(previousPanel==='furniture'?'furniture':'idle'));return;
    }
    if(renderRecipes())return;
    if(quick){
      show('내 루틴',nameOf(playback.bindings['tv-on'])+' 재생 중 · 실제 가전은 작동하지 않아요');
      action('재생 종료',()=>closeMovie(),true).classList.add('stop');return;
    }
    if(panel==='repair'){
      const any=liveTVs().length>0;
      show('영화 보기 · TV 다시 연결',any?'대체 TV를 선택하면 기존 조명 설정으로 바로 재생해요.':sample?'연결할 TV가 없어요. 체험용 TV를 등록해 주세요.':'ThinQ 등록 목록에서 연결할 TV를 찾지 못했어요.');
      if(any){
        tvPicker('대체 TV');
        action('연결하고 재생',()=>startMovie('repair'),true).disabled=!liveTVs().some(d=>d.id===bindings['tv-on']);
      }else if(sample)action('체험용 TV 관리',manageTVs,true);
      action('취소',()=>setPanel('idle'));return;
    }
    if(panel==='devices'){
      show('체험용 TV 관리','등록을 해제하면 해당 TV는 루틴의 연결 목록에서 빠집니다.');
      for(const d of tvCatalog())deviceAction(d);
      action('완료',()=>setPanel('idle'),true);return;
    }
    if(my&&model.homeSource==='unavailable'){
      show('마이룸','ThinQ 등록 목록을 불러오지 못했어요. 연결 설정을 확인해 주세요.');
      action('다시 불러오기',()=>location.reload());return;
    }
    if(panel==='setup'||(panel==='idle'&&my&&!hasHome())){
      show('마이룸','ThinQ 앱에 등록된 가전만 놓을 수 있어요. 체험용 기기에는 냉장고, 무선청소기, 로봇청소기도 있어요.');
      action('체험용 기기 사용',prepare,true);
      if(!recipe)action('다른 가전 루틴',()=>setPanel('recipeList'));return;
    }
    if(panel==='playing'){
      const light=!!playback.bindings['light-dim'];
      show('영화 보기 재생 중',(my?nameOf(playback.bindings['tv-on']):'TV')+' 재생 · '+(light?'조명 30%':'조명 제외')+(my?' · 커튼 제외':' · 커튼 닫힘')+' · 실제 가전은 작동하지 않아요');
      if(!still())action('연출 건너뛰기',()=>{skipped=true;walking=false;render();draw()});
      action('재생 종료',()=>closeMovie());
      if(my){action('내 루틴에 저장',storeRoutine,true);action('연결 설정',()=>closeMovie('connect'))}
      else action('내 방에 맞추기',()=>location.assign(route('my',true)),true);
      return;
    }
    if(panel==='connect'){
      const missing=model.registeredTVs().length?'등록된 TV가 전원 켜기를 지원하지 않아요.':'연결할 TV가 없어요.';
      show('영화 보기 연결',(liveTVs().length?'TV 필수':'TV 필수 · '+missing)+' · 조명 선택 · 커튼은 연결할 기기 없음');
      tvPicker('재생할 TV');
      if(sample&&!liveTVs().length)action('체험용 TV 관리',manageTVs);
      for(const a of model.actions.filter(a=>a.kind==='light')){
        const device=model.candidates(a)[0];if(!device)continue;
        const on=bindings[a.actionId]===device.id;
        const b=action((on?'✓ ':'＋ ')+(a.kind==='tv'?'TV 켜기':'조명 30%'),()=>{
          if(on)delete bindings[a.actionId];else bindings[a.actionId]=device.id;render();
        });b.setAttribute('aria-pressed',String(on));
        if(a.kind==='light'&&!hasLamp())b.disabled=true;
      }
      action('미리보기',()=>startMovie(),true).disabled=!liveTVs().some(d=>d.id===bindings['tv-on']);
      action('다른 가전 루틴',()=>setPanel('recipeList'));action('여러 루틴 설정',openBatch);
      action('루틴 만들기',()=>openComposer());return;
    }
    if(panel==='furniture'){renderFurniture();return}
    if(panel==='product'){
      const item=target,k=item.k;
      const product=M.products[k];
      if(product.modelCode){
        const category=product.catalogFamily||(product.washerStyle?'세탁기':'가전');
        show(product.salesName||category);
        if(!product.salesName)ProductCatalog.loadSalesName(product,category).then(name=>{
          if(name&&panel==='product'&&target===item&&!editMode)show(name);
        });
        const routine=recipeFor(k);
        if(isTV(item)&&!friend){const b=action('영화 보기',()=>startMovie(),true);if(!my)observeOffer(b,item)}
        if(routine&&!compareWashers)action(routine.name,()=>openRecipe(routine,item),true);
        action('닫기',()=>tap(null));return;
      }
      show(my&&isTV(item)&&item.deviceId?nameOf(item.deviceId):product.n);
      if(isTV(item)){
        if(!friend){
          const button=action('영화 보기',()=>startMovie(),true);
          if(!my)observeOffer(button,item);
          action(poweredTV===item?'TV 끄기':'TV 켜기',()=>{
            poweredTV=poweredTV===item?null:item;setPanel('product');
          });
          if(my)action('연결 설정',connect);
        }
      }else if(k==='floor_lamp'){
        if(!friend)action(lampOn?'조명 끄기':'조명 켜기',()=>{lampOn=!lampOn;setPanel('product')});
      }else{
        const t=recipeFor(k);
        if(t)action(t.name,()=>openRecipe(t,item),true);
      }
      action('닫기',()=>tap(null));return;
    }
    if(space==='dream'&&room()==='C'&&list().some(o=>o.exhibit)){
      show('C 현관 투존 · 가전 전시','제품을 눌러 살펴보거나 배치 편집에서 돌려 보세요.');return;
    }
    show(my?'마이룸':'드림룸',list().some(o=>isTV(o)&&visible(o))?'방 안의 TV를 눌러 보세요.':
      list().some(o=>visible(o)&&recipeFor(o.k))?'방 안의 가전을 눌러 루틴을 확인해 보세요.':
      my?'배치 편집에서 등록 가전을 놓아 보세요.':'가전 수집에서 제품을 골라 방에 놓아 보세요.');
  }
  function enter(){
    $('washerComparison').hidden=compareWashers;
    if(menu){$('view').tabIndex=-1;$('view').setAttribute('aria-label','드림룸 미리보기')}
    if(friend)$('view').setAttribute('aria-label',compareWashers?'세탁기 비교. 제품을 탭하거나 방향키로 선택하고 Enter로 모델 정보를 확인하세요.':'예시 친구 방. 소파를 누르거나 방향키로 선택한 뒤 Enter로 루틴을 열 수 있어요.');
    if(samplePreview)$('view').setAttribute('aria-label','루틴 체험용 예시 방');
    if(model.observing){
      if(menu)$('dreamLink').addEventListener('click',()=>log('miniroom_open'));
      $('observationFile').hidden=false;
      $('observationFile').onclick=()=>{try{model.exportObservation()}catch{notice('관찰 기록을 내려받을 수 없어요.')}};
      document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!offeredTarget&&(panel==='product'||(friend&&panel==='idle')))render()});
    }
    reducedMotion.addEventListener('change',()=>{
      if(reducedMotion.matches)walking=false;
      if(playback||reaction||poweredTV){render();draw();if(!still())animate()}
    });
    $('routineBagButton').onclick=openBag;
    $('editMode').onclick=toggleEdit;$('manageTVs').onclick=manageTVs;$('libraryButton').onclick=openLibrary;
    window.addEventListener('storage',e=>{
      if($('routineBag').open&&e.key?.startsWith(model.discoveryPrefix)){openBag();return}
      const suffix=sample?'':'.'+model.homeSource;
      if(!friend&&(e.key==='lg-miniroom.state'+suffix||e.key===(my?'lg-miniroom.dot.my'+suffix:'dotroom')||e.key===null))location.reload();
    });
    if(my&&params.has('connect')){
      recipe=templates.find(t=>t.id===params.get('template'))||null;
      if(!hasHome())setPanel('setup');else if(recipe)openRecipe(recipe);else connect();
      if(hasHome()||!recipe)clearConnectLink();
    }
    if(history.state?.dotMovie)history.replaceState(null,'');
    if(my&&params.has('inventoryRun')){
      const id=params.get('inventoryRun'),url=new URL(location.href);
      url.searchParams.delete('inventoryRun');history.replaceState(history.state,'',url);
      const record=model.state.savedRoutines.find(r=>r.custom&&r.templateId===id);
      if(record&&hasHome()){returnToBag=customReady(record);runCustom(record,'idle')}
      else{openBag();notice('이 계정에서 저장한 루틴을 확인해 주세요.')}
    }
    if(my&&params.has('inventoryConnect')){
      const t=batchTemplates.find(t=>t.id===params.get('inventoryConnect'));
      const url=new URL(location.href);url.searchParams.delete('inventoryConnect');history.replaceState(history.state,'',url);
      if(t)connectFromInventory(t);
    }
    if(!readOnly&&params.get('inventory')==='1'){
      const url=new URL(location.href);url.searchParams.delete('inventory');history.replaceState(history.state,'',url);
      openBag();
    }
    if(samplePreview)startSamplePreview();
    if(!readOnly)cameraReturn();
    if(model.storageMessage)notice(model.storageMessage);
    window.addEventListener('pageshow',e=>{if(e.persisted)location.reload()});
  }
  const interactive=o=>!menu&&(isAppliance(o.k)||o.k==='sofa'||(my&&isFurniture(o)));
  return {enter,registeredReplacement,visible,allowed,owned,isAppliance,bindUnit,interactive,restoreDeviceIds,identifyDevices,placementClue,editing:()=>editMode,frame,tap,canAdd,reset};
}

function lgCameraBase(params){
  const requested=params.get('camera');
  if(requested){
    try{
      const url=new URL(requested);
      if(/^https?:$/.test(url.protocol)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))return url.origin;
    }catch{}
  }
  return LG_CAMERA_URL;
}

function createPhotoPicker({$,showProducts,isCollectible,recognizePhoto,provider}){
  const dialog=$('library'),input=$('photoInput'),preview=$('photoPreview');
  const mode=$('photoMode'),manual=$('photoManual'),retry=$('photoRetry'),status=$('libraryStatus');
  let file=null,url=null,decoded=false,request=null,outcome='not_requested',candidates=[];

  function stop(){
    if(request){
      clearTimeout(request.timer);
      request.controller.abort();
      request=null;
    }
  }
  function reset(clearInput=true){
    stop();
    if(url)URL.revokeObjectURL(url);
    file=url=null;decoded=false;outcome='not_requested';candidates=[];
    if(clearInput)input.value='';
    preview.removeAttribute('src');preview.hidden=true;
    mode.value='manual';manual.hidden=true;retry.hidden=true;
  }
  function useCatalog(){
    stop();mode.value='manual';manual.hidden=true;retry.hidden=true;
    showProducts();status.textContent='카탈로그에서 사진 속 제품을 직접 선택하세요.';
  }
  function fallback(reason){
    outcome=reason;candidates=[];manual.hidden=true;retry.hidden=false;
    showProducts();
    status.textContent={
      no_match:'일치하는 제품이 없어요.',
      error:'후보를 불러오지 못했어요.',
      timeout:'후보 응답이 늦어지고 있어요.'
    }[reason]+' 다시 시도하거나 아래 목록에서 직접 선택하세요.';
  }
  async function run(){
    stop();
    if(!file||!decoded||!dialog.open)return;
    if(mode.value==='manual'){useCatalog();return}
    const current={controller:new AbortController()};
    request=current;outcome='pending';candidates=[];
    current.timer=setTimeout(()=>{
      if(request!==current||!dialog.open)return;
      stop();fallback('timeout');
    },8000);
    manual.hidden=false;retry.hidden=true;showProducts([]);
    status.textContent='예시 후보를 불러오는 중이에요.';
    try{
      const keys=await recognizePhoto(file,{example:mode.value,signal:current.controller.signal});
      if(request!==current||!dialog.open)return;
      if(!Array.isArray(keys))throw Error('후보 목록 형식 오류');
      candidates=[...new Set(keys.filter(isCollectible))];
      if(!candidates.length){fallback('no_match');return}
      outcome=candidates.length===1?'single':'multiple';
      showProducts(candidates);
      status.textContent=candidates.length===1?'예시 후보 1개예요. 사진 속 제품과 맞으면 수집하세요.':
        '예시 후보 '+candidates.length+'개 중 사진과 일치하는 제품을 선택하세요.';
      $('libraryItems').firstElementChild?.scrollIntoView({block:'nearest'});
    }catch{
      if(request===current&&dialog.open)fallback('error');
    }finally{
      clearTimeout(current.timer);
      if(request===current)request=null;
    }
  }

  input.onchange=async()=>{
    const selected=input.files[0];
    if(!selected)return;
    const example=mode.value;
    reset(false);mode.value=example;showProducts();status.textContent='';
    if(selected.type&&!selected.type.startsWith('image/')){
      status.textContent='이미지 파일을 선택하거나 카탈로그에서 수집하세요.';return;
    }
    file=selected;url=URL.createObjectURL(file);
    const currentURL=url;
    preview.src=url;preview.hidden=false;
    try{await preview.decode()}catch{
      if(url===currentURL&&dialog.open){
        reset();status.textContent='이 사진을 열 수 없어요. 다른 사진이나 카탈로그를 선택하세요.';
      }
      return;
    }
    if(url!==currentURL||!dialog.open)return;
    decoded=true;run();
  };
  mode.onchange=run;manual.onclick=useCatalog;retry.onclick=run;
  dialog.addEventListener('close',()=>{if(!dialog.open)reset()});

  function selection(key){
    if(!file)return null;
    if(outcome==='not_requested')return {decision:'manual'};
    const decision=candidates.length?(candidates.includes(key)?'confirmed':'corrected'):'manual';
    return {provider,outcome,decision};
  }
  return {reset,selection};
}
