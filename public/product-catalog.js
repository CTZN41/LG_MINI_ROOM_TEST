const ProductCatalog=(()=>{
  // Product keys identify models; several models can share the same photographed body.
  const componentCodes=new Set(['FC4SC','FX4KCQ','FX4VCQ','FC4TC','FX4KC','FX4VC','FX4WC','FX4GC','FX4EC']);
  function componentOnly(key){
    if(key==='washer_fc4sc')return true;
    return typeof key==='string'&&key.startsWith('catalog:washer:')&&componentCodes.has(key.slice(15).toUpperCase());
  }
  const bodyIndex=new Map();
  const shapeNames={tvFlat:'평판 TV',tvMobile:'기둥형 이동식 TV',tvCase:'캐리백형 TV',tvFlex:'플렉스 TV',
    tvEasel:'패브릭 하단·다리형 포제',tvCompact:'탁상형 룸앤TV',stickAir:'슬림형 A9 Air',stickA5:'코드제로 A5',
    stickA7:'코드제로 A7',stickA9:'코드제로 A9',stickA9S:'코드제로 A9S',four:'4도어',french:'양문과 하단 서랍',single:'1도어',column:'세로형 컨버터블',
    miniCube:'낮은 사각 1도어',miniTall:'소형 세로 1도어',wineShort:'소형 와인셀러',wineMid:'중형 와인셀러',wineTall:'세로형 와인셀러',
    glassDrawers:'전면 유리와 하단 서랍',drawerFour:'상단 양문과 하단 2단 서랍',bottom:'상냉장·하냉동형',side:'양문형',freezerTop:'상냉동형',two:'2도어 대표형',plain:'냉장고 대표형',
    dryer:'전면 도어 건조기',tower:'일체형 워시타워',twin:'하단 미니워시 결합형',combo:'워시콤보',
    comboMini:'워시콤보·하단 미니워시 결합형',top:'상단 도어 통돌이',small:'소형 드럼',drum:'전면 도어 드럼'};
  const toneNames={peach:'피치',berry:'자홍',coral:'코럴',wine:'레드우드',almond:'아몬드',taupe:'토프',neutral:'대표색',white:'화이트',silver:'실버',grey:'그레이',black:'차콜',brown:'브라운',
    beige:'베이지',green:'그린',mint:'민트',pink:'핑크',blue:'하늘색',navy:'네이비',violet:'라벤더',yellow:'레몬'};
  const oldSales=new Map(),oldIds=new Map();
  async function loadRetiredSales(){
    const res=await fetch('/api/catalog/retired-sales',{signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw Error('catalog migration');
    for(const [id,category,code,unitCategory,unitCode,choices] of await res.json()){
      const key=keyFor(families.find(f=>f.name===category),code);
      const primary=matchModel(unitCategory,unitCode);
      if(!primary)throw Error('대표 본체 누락 '+code);
      const oldParts=choices.map(([c,m])=>matchModel(c,m)).filter(Boolean);
      const selectable=oldParts.length>1||category==='공기청정기'?oldParts:[];
      const entry={primary,keys:[...new Set([primary,...selectable])]};
      if(!oldSales.has(key))oldSales.set(key,entry);
      oldIds.set(id,entry);
    }
  }
  function migratePlacement(o){
    if(!o||typeof o!=='object')return;
    const sale=oldSales.get(o.k);
    if(sale)o.k=sale.primary;
    const origin=oldIds.get(o.bundleId);
    if(origin?.keys.includes(o.k))delete o.bundleId;
  }
  async function loadBodies(){
    const res=await fetch('/api/catalog/bodies',{signal:AbortSignal.timeout(5000)});
    if(!res.ok)throw Error('catalog bodies');
    for(const [category,model,shape,upper,lower,detail,main,description,decision,inches] of await res.json()){
      bodyIndex.set(category+'|'+model,{shape,upper,lower,detail,main,description,decision,inches});
    }
  }
  function applyBody(item,body=bodyIndex.get(item.catalogFamily+'|'+item.modelCode)){
    if(!body)return;
    const {shape,upper,lower,detail,main}=body;
    item.body=body;item.spriteKey=['body',shape,upper,lower,detail].join(':');
    item.appearance=shapeNames[shape]+' · '+toneNames[upper]+(lower===upper?'':' / '+toneNames[lower]);
    if(detail==='window')item.appearance+=' · 노크온 창';
    if(item.catalogFamily==='TV'&&body.inches){
      // Compress the diagonal range into whole pixels within the saved placement.
      item.displayWidth=Math.max(9,Math.min(22,Math.round(10+(body.inches-27)*0.16)));
      item.spriteKey+=':'+item.displayWidth;
      item.appearance+=' · '+body.inches+'인치';
    }
    if(shape==='tvMobile'||detail==='deskWhite'){item.previousFootprint={w:item.w,d:item.d};item.w=14}
    if(detail==='dock')item.appearance+=' · 충전 타워 포함';
    if(body.description)item.appearance+=' · '+body.description;
    if(shape==='dryer'&&detail)item.behaviorKey='dryer';
    if(detail==='water')item.appearance+=' · 정수부';
    if(detail==='review')item.appearance+=' · 사진 확인 중';
    if(main)item.appearance+=' · 세트에서 '+main+' 본체 배치';
    if(item.catalogFamily==='세탁기')item.washerStyle=shape;
  }
  // Identical primary-unit photographs at DB image IDs 2090, 2054 and 1960.
  const washerMaster=new Map([
    ['F21VDSK','F21VDSKR'],['FG19WN','FG19WNR'],['FG21WN','FG19WNR'],
    ['FG21WNR','FG19WNR'],['WL21WDU','WL2521WDUR']
  ]);
  function useWasherMaster(item){
    if(item.catalogFamily!=='세탁기'||!item.body)return;
    const unit=item.body.main||item.modelCode;
    const code=washerMaster.get(unit)||unit;
    const master=DOT_ASSETS.items.find(p=>p.modelCode===code&&p.washerStyle===item.body.shape);
    if(!master)return;
    // Keep the sale key, photo, footprint and bundle origin on the placed object.
    item.nativeWasher=true;item.spriteKey=master.spriteKey||master.k;item.drumY=master.drumY;
    item.body={...item.body,decision:'형태 수정',description:'대표 본체 '+code+' 전용 도트 공유'};
    item.appearance+=' · '+code+' 도트 공유';
  }
  const humidifierArt=new Map();
  for(const [spriteKey,appearance,models] of [
    ['db_humid','넓은 투명 상부 · 허리형',['AW141YBW']],
    ['db_humid_essential','살구색 띠 · 흰 원통형',['HY505RWLAH','HY505RWLL']],
    ['db_humid_taupe','베이지 상단 · 갈색 타워',['HY703RCAAH']],
    ['db_humid_forest','청록빛 짙은 타워',['HY703RGAAH']],
    ['db_humid_olive','올리브빛 짙은 타워',['HY704RGUA']],
    ['db_humid_cream','크림 상단 · 웜그레이 타워',['HY704RSAAH','HY704RSUA','HY705RSUA','HY706RSUA']],
    ['db_humid_silver','흰 상단 · 실버 타워',['HY703RWAAH','HY704RWUA','HY705RWUA','HY706RWUA']]
  ])for(const model of models)humidifierArt.set(model,{spriteKey,appearance});
  const dehumidifierArt=new Map();
  for(const [shape,finish,appearance,codes] of dehumidifierProfiles){
    for(const code of codes)dehumidifierArt.set(code,{spriteKey:'db_dehumid_'+shape+'_'+finish,appearance});
  }
  const purifierModels=['AS206NGHA','FS064PSJA','AS063PWGCR','AS356LSAA'];
  const purifierNames={
    AS206NGHA:'360° 원통형',FS064PSJA:'에어로타워',AS063PWGCR:'에어로퍼니처',AS356LSAA:'월핏',
    AS153HWFS:'360° Hit',AS356NSMA:'360° M7'
  };
  const families=[
    ['tv','TV','55LX1QKNA',22,6,'tvset'],['fridge','냉장고','M876GBC472',15,11,'fridge_bm'],
    ['washer','세탁기','FG19WNR',12,10,'wash_m'],['dryer','건조기','RD20WNR',12,11],
    ['purifier','공기청정기','AS235DWSA',8,8,'puri_p'],['humid','가습기','AW141YBW',9,9,'humidifier'],
    ['dehumid','제습기','DQ203PCCA',10,9,'dehumidifier'],['robot','로봇청소기','R560BL1',8,8,'robot_vacuum'],
    ['stick','무선청소기','A912PM',6,6,'vacuum']
  ].map(([slug,name,model,w,d,behavior])=>({slug,name,model,w,d,behavior}));
  function keyFor(family,model){
    if(family.slug==='washer'){
      const item=DOT_ASSETS.items.find(p=>p.washerStyle&&p.modelCode===model);
      if(item)return item.k;
    }
    return 'catalog:'+family.slug+':'+encodeURIComponent(model);
  }
  // exactLookup: DB model_name as stored (no case folding, no partial match) -> product key.
  const modelKeys=new Set(),modelLookup=new Map(),exactLookup=new Map();
  async function loadModels(){
    const response=await fetch('/api/catalog/models',{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('제품 DB 연결 실패');
    const rows=await response.json();
    if(!Array.isArray(rows)||!rows.length)throw Error('제품 DB에 모델이 없어요.');
    for(const [category,code] of rows){
      const family=families.find(f=>f.name===category);
      if(!family)continue;
      const key=keyFor(family,code);
      if(componentOnly(key))continue;
      modelKeys.add(key);modelLookup.set(category+'|'+code.toUpperCase(),key);exactLookup.set(code,key);
    }
    if(!modelKeys.size)throw Error('지원되는 제품 모델이 없어요.');
  }
  const hasModel=key=>modelKeys.has(key);
  const matchModel=(category,code)=>typeof code==='string'&&modelLookup.get(category+'|'+code.trim().toUpperCase());
  // LG CAMERA sends the official model name only, without a category. DB model names are unique across categories.
  function exactModel(code){
    return typeof code==='string'?exactLookup.get(code):undefined;
  }
  function restore(products,key){
    if(typeof key!=='string'||oldSales.has(key))return;
    if(Object.hasOwn(products,key))return products[key];
    const match=/^catalog:([a-z]+):([^:]{1,1000})$/.exec(key);
    if(!match)return;
    const f=families.find(v=>v.slug===match[1]);if(!f)return;
    let model;try{model=decodeURIComponent(match[2])}catch{return}
    if(!model.trim()||keyFor(f,model)!==key)return;
    const washer=f.slug==='washer'?products.washer_fg19wnr:null;
    const item={...washer,k:key,n:f.name+' '+model,c:'가전',w:f.w,d:f.d,elev:0,wall:0,layer:1,
      modelCode:model,spriteKey:washer?.spriteKey||'db_'+f.slug,catalogFamily:f.name,
      behaviorKey:f.behavior,photoUrl:'/api/catalog/photo?'+new URLSearchParams({category:f.name,model,v:'3'})};
    if(f.slug==='purifier'){
      const profile=PurifierReview.models.get(model);
      if(profile){
        item.appearance=profile.reason;
        if(profile.shape!=='hold'){
          // Saved placements without an art version retain the original 8 × 8 footprint.
          item.previousFootprint={w:item.w,d:item.d};
          Object.assign(item,{w:profile.w,d:profile.d,spriteKey:profile.spriteKey});
        }
        if(purifierNames[model])item.n=purifierNames[model]+' '+model;
      }
    }
    if(f.slug==='tv')item.screen=[10,11,39,30];
    if(f.slug==='dehumid'&&dehumidifierArt.has(model))Object.assign(item,dehumidifierArt.get(model));
    if(f.slug==='humid'&&humidifierArt.has(model))Object.assign(item,humidifierArt.get(model));
    if(f.slug==='robot'&&CatalogArt.robots.has(model))Object.assign(item,CatalogArt.robots.get(model));
    applyBody(item);useWasherMaster(item);products[key]=item;return item;
  }
  const namesInFlight=new Map();
  function salesName(row,category){
    const name=row.name.replaceAll(row.model,'').replace(/\s+/g,' ').trim();
    if(!name||name==='LG전자')return ['LG전자',category].join(' ');
    if(name==='LG전자 리퍼비시')return 'LG전자 '+category+' 리퍼비시';
    return name;
  }
  function loadSalesName(item,category){
    const key=item.k;
    if(namesInFlight.has(key))return namesInFlight.get(key);
    const params=new URLSearchParams({category,q:item.modelCode,featured:item.modelCode});
    const request=fetch('/api/catalog?'+params,{signal:AbortSignal.timeout(5000)})
      .then(async response=>{
        if(!response.ok)return;
        const {rows}=await response.json();
        const row=rows.find(r=>r.model===item.modelCode);
        if(row)item.salesName=salesName(row,category);
        return item.salesName;
      }).catch(()=>undefined).finally(()=>namesInFlight.delete(key));
    namesInFlight.set(key,request);
    return request;
  }
  function browser({$,scene,tone,collected,collect}){
    const familiesBox=$('catalogFamilies'),rows=$('catalogRows'),search=$('catalogSearch');
    let family=null,offset=0,request,timer;
    function cancel(){clearTimeout(timer);request?.abort()}
    function product(f,code){return restore(scene.products,keyFor(f,code))}
    function thumbnail(item){
      const c=document.createElement('canvas');c.width=74;c.height=70;c.setAttribute('aria-hidden','true');
      scene.thumbnail(c,item.k,tone());return c;
    }
    function componentArt(part){
      if(part.role==='미니워시')return scene.products.washer_fc4sc;
      const key=matchModel(part.category||part.role,part.model);
      return key&&restore(scene.products,key);
    }
    function productDetails(row,signal){
      const details=document.createElement('details'),summary=document.createElement('summary');
      details.className='catalog-details';summary.textContent='제품 사진·구성';details.append(summary);
      let loaded=false;
      details.ontoggle=async()=>{
        if(!details.open||loaded||signal.aborted)return;
        loaded=true;
        const content=document.createElement('div');
        content.textContent='구성 모델을 불러오는 중…';details.append(content);
        try{
          const res=await fetch('/api/catalog/product?id='+row.id,{signal});
          if(!res.ok)throw Error();
          const data=await res.json();if(signal.aborted)return;
          const photo=document.createElement('img');photo.alt=row.model+' 상품 사진';
          photo.onerror=()=>photo.replaceWith(document.createTextNode('상품 사진을 표시할 수 없어요.'));
          photo.src='/api/catalog/photo?v=3&id='+data.id;
          content.replaceChildren(photo);
          if(data.photoStatus==='보류'){
            const note=document.createElement('small');note.textContent='사진 확인 중';content.append(note);
          }
          const parts=document.createElement('ul');
          parts.setAttribute('aria-label','구성 모델');
          const seen=new Set();
          for(const part of data.components){
            const entryKey=JSON.stringify([part.role,part.model,part.evidence,part.specification]);
            if(seen.has(entryKey))continue;
            seen.add(entryKey);
            const li=document.createElement('li'),name=document.createElement('span'),art=componentArt(part);
            if(art)li.append(thumbnail(art));
            name.textContent=part.role+' · '+part.model+(art?'':' · 도트 준비 전');
            if(part.role==='미니워시')name.textContent+=' · 세탁기 하단 결합 전용';
            else if(part.model===data.titleModel&&['냉장고','세탁기','건조기'].includes(data.category))name.textContent+=' · 대표 본체';
            if(part.specification){
              const spec=document.createElement('small');spec.textContent=part.specification;name.append(spec);
            }
            li.append(name);parts.append(li);
          }
          content.append(parts);
        }catch{
          if(signal.aborted)return;
          content.remove();loaded=false;summary.textContent='제품 사진·구성 (다시 열어 재시도)';
        }
      };
      return details;
    }
    function title(text){$('libraryTitle').textContent=text}
    function gallery(){
      cancel();family=null;offset=0;search.value='';rows.replaceChildren();familiesBox.replaceChildren();
      $('libraryBrowse').hidden=true;$('catalogBrowse').hidden=false;familiesBox.hidden=false;
      $('catalogQuery').hidden=$('catalogPrev').hidden=$('catalogNext').hidden=true;
      $('catalogStatus').textContent='';$('catalogBack').textContent='수집 목록';title('제품군별 도트');
      for(const f of families){
        const b=document.createElement('button'),name=document.createElement('strong'),model=document.createElement('small');
        name.textContent=f.name;model.textContent=f.model;b.append(thumbnail(product(f,f.model)),name,model);
        b.onclick=()=>{family=f;offset=0;search.value='';list()};familiesBox.append(b);
      }
    }
    async function list(){
      cancel();const controller=request=new AbortController();
      title(family.name+' 제품');$('catalogBack').textContent='제품군 선택';
      familiesBox.hidden=true;$('catalogQuery').hidden=false;$('catalogPrev').hidden=$('catalogNext').hidden=true;
      rows.replaceChildren();$('catalogStatus').textContent='제품을 불러오는 중…';
      try{
        const params=new URLSearchParams({category:family.name,featured:family.model,q:search.value,offset});
        const res=await fetch('/api/catalog?'+params,{signal:controller.signal});
        if(!res.ok)throw Error();
        const data=await res.json();if(controller.signal.aborted)return;
        $('catalogStatus').textContent=data.total?(offset+1)+'–'+(offset+data.rows.length)+' / '+data.total+'개 모델':'검색 결과가 없어요.';
        $('catalogPrev').hidden=!offset;$('catalogNext').hidden=offset+data.rows.length>=data.total;
        for(const row of data.rows){
          const item=product(family,row.model),entry=document.createElement('article'),label=document.createElement('span');
          const b=document.createElement('button'),code=document.createElement('strong'),desc=document.createElement('small');
          item.salesName=salesName(row,family.name);
          code.textContent=row.model;desc.textContent=row.name+' · '+(item.appearance||(row.model===family.model?'대표 모델':item.catalogFamily?'제품군 대표 도트':'모델별 도트'));
          label.append(code,desc);b.disabled=collected(item.k);b.textContent=b.disabled?'수집 완료':'수집';
          b.setAttribute('aria-label',row.model+' 수집');b.onclick=()=>collect(item,entry);
          entry.append(thumbnail(item),label,b,productDetails(row,controller.signal));rows.append(entry);
        }
      }catch{
        if(controller.signal.aborted)return;
        $('catalogStatus').textContent='제품 DB를 불러오지 못했어요.';
        const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=list;rows.append(retry);
      }
    }
    $('catalogNext').onclick=()=>{offset+=16;list();$('library').scrollTop=0};
    $('catalogPrev').onclick=()=>{offset=Math.max(0,offset-16);list();$('library').scrollTop=0};
    $('catalogBack').onclick=()=>{if(family){gallery();return}cancel();$('catalogBrowse').hidden=true;$('libraryBrowse').hidden=false;title('가전 수집')};
    search.oninput=()=>{cancel();rows.replaceChildren();$('catalogNext').hidden=$('catalogPrev').hidden=true;offset=0;timer=setTimeout(list,150)};
    $('library').addEventListener('close',cancel);
    return {gallery,resume(){ $('catalogBrowse').hidden=false;list() }};
  }
  return {restore,applyBody,loadSalesName,browser,representatives:()=>families.map(f=>keyFor(f,f.model)).filter(hasModel),loadModels,hasModel,matchModel,exactModel,purifierModels,componentOnly,loadBodies,loadRetiredSales,migratePlacement,retiredSale:key=>oldSales.get(key)};
})();
