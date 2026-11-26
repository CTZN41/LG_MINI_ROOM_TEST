// LG CAMERA 연동: [LG CAMERA로 찍기] 이동, lgcam=registered/cancelled 복귀 처리.
// 실제 카메라 사이트에는 접속하지 않는다(기본 주소는 가짜 응답으로 대체).
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:4173';
const MODEL='55LX1QKNA',KEY='catalog:tv:55LX1QKNA';
const item=modelCode=>encodeURIComponent(JSON.stringify({id:'scan-1',modelCode,displayName:'DISPLAY_SECRET',fullCode:'FULLCODE_SECRET_123',imageUrl:'https://img.example/SECRET.png'}));
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lg-miniroom.state')||'null'));
const ready=page=>page.waitForFunction(()=>localStorage.getItem('dotroom'));
const libraryOpen=page=>page.waitForFunction(()=>document.getElementById('library').open);

(async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  const page=await browser.newPage();
  await page.route('**/api/my-appliances',r=>r.fulfill({json:{mode:'demo'}}));
  await page.route('https://lg-camera-lab.pages.dev/**',r=>r.fulfill({body:'<title>stub</title>',contentType:'text/html'}));
  await page.route('http://localhost:4173/**',r=>r.fulfill({body:'<title>stub</title>',contentType:'text/html'}));
  const openCamera=async(query,pattern)=>{
    await page.goto(base+'/editor?space=dream'+query);await ready(page);
    await page.getByRole('button',{name:'가전 수집',exact:true}).click();
    assert.equal(await page.locator('#photoInput').count(),1,'기존 사진 선택 유지');
    assert.equal(await page.locator('#photoMode option').count(),5,'기존 사진 후보 체험 유지');
    const from=page.url();
    await Promise.all([page.waitForURL(pattern),page.getByRole('button',{name:'LG CAMERA로 찍기',exact:true}).click()]);
    return {from,to:page.url()};
  };

  // 카메라로 이동: ?camera 로컬 주소, 기본 주소, 루프백이 아닌 ?camera는 무시
  let {from,to}=await openCamera('&camera=http://localhost:4173',/^http:\/\/localhost:4173\/scan\?/);
  assert.equal(to,'http://localhost:4173/scan?returnTo='+encodeURIComponent(from));
  await openCamera('',/^https:\/\/lg-camera-lab\.pages\.dev\/scan\?returnTo=/);
  await openCamera('&camera=https://evil.example',/^https:\/\/lg-camera-lab\.pages\.dev\/scan\?returnTo=/);

  // registered: DB 모델명과 정확히 같으면 수집, 방에 놓기
  await page.goto(base+'/editor?space=dream&camera=http://localhost:4173&lgcam=registered&lgcam_item='+item(MODEL)+'#keep');await ready(page);
  await page.waitForSelector('#collectionResult:not([hidden])');
  assert.equal(await page.locator('#libraryTitle').textContent(),'수집 완료');
  assert.equal(await page.locator('#collectedName').textContent(),'TV '+MODEL);
  let s=await state(page);
  assert.ok(s.collection.includes(KEY));assert.equal(s.collectionSources[KEY],'camera');
  const url=new URL(page.url());
  assert.ok(!url.searchParams.has('lgcam')&&!url.searchParams.has('lgcam_item'));
  assert.equal(url.searchParams.get('camera'),'http://localhost:4173');assert.equal(url.hash,'#keep');
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));
  for(const secret of ['DISPLAY_SECRET','FULLCODE_SECRET','SECRET.png','scan-1'])assert.ok(!stored.includes(secret),'저장 금지: '+secret);
  await page.getByRole('button',{name:'방에 놓기',exact:true}).click();
  assert.equal(await page.evaluate(k=>Object.values(JSON.parse(localStorage.getItem('dotroom')).layouts).flat().filter(o=>o.k===k).length,KEY),1);

  // 새로고침해도 다시 수집하지 않음
  const revision=s.revision;
  await page.reload();await ready(page);await page.waitForTimeout(300);
  assert.equal((await state(page)).revision,revision);
  assert.equal(await page.locator('#library').evaluate(d=>d.open),false);

  // 이미 수집한 제품: 늘리지 않고 기존 것을 보여 줌
  await page.goto(base+'/editor?space=dream&lgcam=registered&lgcam_item='+item(MODEL));await ready(page);
  await page.waitForSelector('#collectionResult:not([hidden])');
  assert.equal(await page.locator('#libraryTitle').textContent(),'이미 수집한 제품');
  s=await state(page);assert.equal(s.revision,revision);assert.equal(s.collection.filter(k=>k===KEY).length,1);

  // DB에 없는 모델(부분 일치, 대소문자, 공백 포함): 안내만, 수집 안 함
  for(const code of ['NOTAREAL123','55LX1QK','55lx1qkna',' 55LX1QKNA']){
    await page.goto(base+'/editor?space=dream&lgcam=registered&lgcam_item='+item(code));await ready(page);await libraryOpen(page);
    assert.equal(await page.locator('#libraryStatus').textContent(),'미니룸 제품 DB에 없는 모델입니다 (모델명 '+code+')');
    assert.equal(await page.locator('#libraryTitle').textContent(),'가전 수집');
    assert.equal((await state(page)).revision,revision);assert.ok(!page.url().includes('lgcam'));
  }

  // cancelled: 가전 수집 화면만
  await page.goto(base+'/editor?space=dream&lgcam=cancelled');await ready(page);await libraryOpen(page);
  assert.equal(await page.locator('#libraryTitle').textContent(),'가전 수집');
  assert.equal(await page.locator('#libraryStatus').textContent(),'');assert.ok(!page.url().includes('lgcam'));

  await browser.close();
  console.log('LG CAMERA 이동, 등록·중복·DB 없음·취소 복귀, 주소 정리, 저장 항목 passed');
})().catch(e=>{console.error(e);process.exit(1)});
