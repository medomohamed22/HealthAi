const STORE={user:"healthai_user_v3",plan:"healthai_plan_v3",progress:"healthai_progress_v3",diary:"healthai_meal_diary_v1",language:"healthai_language_v1"};
const $=s=>document.querySelector(s);
const safe=(v="")=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const FALLBACK_MEAL_IMAGE="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eaf8f2"/><stop offset="1" stop-color="#ccebdd"/></linearGradient></defs>
  <rect width="900" height="500" fill="url(#g)"/>
  <circle cx="450" cy="235" r="118" fill="#fff" stroke="#0b6b4b" stroke-width="12"/>
  <path d="M368 230c50-75 115-75 164 0-49 73-114 73-164 0Z" fill="#18a574" opacity=".92"/>
  <circle cx="450" cy="230" r="31" fill="#fff"/>
  <text x="450" y="405" text-anchor="middle" font-family="Arial" font-size="34" fill="#0b6b4b">HealthAi Meal</text>
</svg>`);
const IMAGE_CACHE_KEY="healthai_meal_images_v2";
let currentPlan=null,currentDay=0,replaceTarget=null;

function collectData(){return{name:$("#name").value.trim(),gender:$("#gender").value,age:+$("#age").value,heightCm:+$("#height").value,weightKg:+$("#weight").value,goalWeightKg:+$("#goalWeight").value,goal:$("#goal").value,activityFactor:+$("#activity").value,activityText:$("#activity").selectedOptions[0].textContent,mealsPerDay:+$("#meals").value,budget:$("#budget").value,dietType:document.querySelector('input[name=diet]:checked').value,favoriteFoods:$("#likes").value.trim(),excludedFoodsAndAllergies:$("#avoid").value.trim(),medicalNotes:$("#medical").value.trim()}}
function calculateNutrition(u){
 const bmr=u.gender==="ذكر"?10*u.weightKg+6.25*u.heightCm-5*u.age+5:10*u.weightKg+6.25*u.heightCm-5*u.age-161;
 const tdee=bmr*u.activityFactor;let target=tdee;
 if(u.goal==="خسارة الدهون")target-=400;if(u.goal==="بناء العضلات")target+=250;if(u.goal==="زيادة الوزن")target+=350;
 const minCalories=u.gender==="ذكر"?1500:1200;target=Math.max(target,minCalories);
 const protein=u.weightKg*(u.goal==="بناء العضلات"?2:1.6);
 const fats=u.weightKg*.8;const carbs=Math.max(70,(target-protein*4-fats*9)/4);
 const bmi=u.weightKg/Math.pow(u.heightCm/100,2);const water=u.weightKg*35/1000;
 return{bmr:Math.round(bmr),tdee:Math.round(tdee),targetCalories:Math.round(target),protein:Math.round(protein),fats:Math.round(fats),carbs:Math.round(carbs),bmi:+bmi.toFixed(1),water:+water.toFixed(1)}
}
function updateLocalCalc(){const c=calculateNutrition(collectData());$("#calcBmi").textContent=c.bmi;$("#calcTdee").textContent=c.tdee;$("#calcTarget").textContent=c.targetCalories}
$("#nutritionForm").addEventListener("input",()=>{updateLocalCalc();saveUser()});
$("#nutritionForm").addEventListener("change",saveUser);

function healthWarnings(u,c){const w=[];if(u.age<18)w.push("Age أقل من 18 عامًا؛ يجب مراجعة ولي أمر ومختص.");if(c.bmi<18.5&&u.goal==="خسارة الدهون")w.push("هدف خسارة الدهون قد لا يكون مناسبًا مع مؤشر كتلة منخفض.");if(/سكري|كلى|كبد|حمل|رضاعة|اضطراب|دواء|ضغط|قلب/i.test(u.medicalNotes))w.push("الملاحظات الصحية المذكورة تحتاج مراجعة طبيب أو أخصائي تغذية قبل التطبيق.");return w}

function weeklyPrompt(u,c){
const outputLanguage=currentLanguage==="ar"?"العربية":"English";
return `أنت مساعد تغذية محترف. اكتب النتيجة باللغة ${outputLanguage}. أنشئ خطة تعليمية لمدة 7 days.
Your information:${JSON.stringify(u)}
الحسابات المحلية التي يجب الالتزام بها:${JSON.stringify(c)}
القواعد:
- عدد الوجبات كل يوم ${u.mealsPerDay}.
- متوسط السعرات اليومية قريب من ${c.targetCalories}.
- البروتين اليومي قريب من ${c.protein} جم.
- احترم الحساسية والمستبعدات تمامًا.
- استخدم أكلات عربية ومصرية عملية حسب ميزانية ${u.budget}.
- لكل وجبة اكتب imageKeyword بالإنجليزية بدقة، يصف شكل الطبق نفسه للبحث عن صورة حقيقية على الإنترنت، مثل grilled chicken rice plate.
- لا تشخص مرضًا ولا تصف علاجًا.
أعد JSON فقط:
{"title":"","summary":"","medicalWarning":"","days":[{"day":"","totalCalories":0,"meals":[{"name":"","ingredients":"","calories":0,"protein":0,"carbs":0,"fats":0,"alternative":"","prepTime":"","difficulty":"","instructions":[""],"imageKeyword":""}]}],"tips":[""],"shoppingList":[{"category":"","item":"","quantity":""}]}`}

async function apiRequest(url, options={}){
  const controller=new AbortController();
  const timeoutMs=url.includes("/api/gemini")?50000:15000;
  const timer=setTimeout(()=>controller.abort(),timeoutMs);

  try{
    const response=await fetch(url,{
      ...options,
      signal:controller.signal,
      headers:{
        "Content-Type":"application/json",
        ...(options.headers||{})
      }
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      throw new Error(data?.error||data?.message||`Request failed (${response.status})`);
    }
    return data;
  }catch(error){
    if(error?.name==="AbortError"){
      throw new Error("استغرق الطلب وقتًا طويلًا. حاول مرة أخرى بصورة أصغر أو بيانات أقل.");
    }
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

async function geminiText(prompt,json=true){
  const data=await apiRequest("/api/gemini",{
    method:"POST",
    body:JSON.stringify({
      mode:"text",
      prompt,
      json
    })
  });

  return data.result;
}

function validatePlan(p,u,c){
 if(!p||!Array.isArray(p.days)||!p.days.length)throw new Error("رد Gemini غير منظم.");
 p.days=p.days.slice(0,7);p.days.forEach((d,i)=>{d.day=d.day||["السبت","الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"][i];d.meals=Array.isArray(d.meals)?d.meals.slice(0,u.mealsPerDay):[];d.totalCalories=+d.totalCalories||d.meals.reduce((s,m)=>s+(+m.calories||0),0)});
 p.tips=Array.isArray(p.tips)?p.tips:[];p.shoppingList=Array.isArray(p.shoppingList)?p.shoppingList:[];p.calc=c;return p
}
function renderPlan(p){
 currentPlan=p;const c=p.calc;$("#planTitle").textContent=p.title;$("#summaryText").textContent=p.summary;$("#mBmi").textContent=c.bmi;$("#mBmr").textContent=c.bmr;$("#mTdee").textContent=c.tdee;$("#mCalories").textContent=c.targetCalories;$("#mProtein").textContent=c.protein+" جم";$("#mWater").textContent=c.water+" لتر";$("#medicalWarning").textContent=p.medicalWarning||"Plan تعليمية وليست بديلًا عن المختص.";
 $("#dayTabs").innerHTML=p.days.map((d,i)=>`<button class="day-tab ${i===currentDay?"active":""}" onclick="showDay(${i})">${safe(d.day)}</button>`).join("");
 renderDay();$("#tips").innerHTML=p.tips.map(x=>`<li>${safe(x)}</li>`).join("");$("#empty").style.display="none";clearInterval(planLoadingTimer);planLoadingTimer=null;$("#loading").style.display="none";$("#results").style.display="block";localStorage.setItem(STORE.plan,JSON.stringify(p))
}
function showDay(i){currentDay=i;renderPlan(currentPlan)}

function normalizeImageKeyword(meal){
  const aiKeyword=String(meal?.imageKeyword||"").trim();
  if(aiKeyword)return aiKeyword;

  const name=String(meal?.name||"").toLowerCase();
  const map=[
    [/شوفان|oat/,"oatmeal breakfast bowl"],
    [/بيض|egg/,"egg breakfast plate"],
    [/فراخ|دجاج|chicken/,"grilled chicken meal"],
    [/أرز|رز|rice/,"rice healthy meal"],
    [/زبادي|yogurt/,"yogurt fruit bowl"],
    [/جبنة|قريش|cheese/,"cottage cheese meal"],
    [/بطاطس|potato/,"potato egg meal"],
    [/فول|beans/,"fava beans breakfast"],
    [/عدس|lentil/,"lentil meal"],
    [/سلطة|salad/,"healthy salad bowl"],
    [/لحم|beef|meat/,"grilled beef healthy meal"],
    [/مكرونة|pasta/,"healthy pasta meal"],
    [/سمك|fish/,"grilled fish meal"],
    [/فاكهة|fruit/,"fresh fruit bowl"]
  ];
  for(const [pattern,keyword] of map){
    if(pattern.test(name))return keyword;
  }
  return "healthy food meal plate";
}

function readImageCache(){
  try{return JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY)||"{}")}
  catch{return {}}
}
function writeImageCache(cache){
  try{localStorage.setItem(IMAGE_CACHE_KEY,JSON.stringify(cache))}
  catch(error){console.warn("Image cache was not saved",error)}
}





async function searchMealImage(keyword,meal,index){
  const normalized=String(keyword||meal?.name||"healthy meal").trim().toLowerCase();
  const cache=readImageCache();
  if(cache[normalized])return cache[normalized];

  const params=new URLSearchParams({
    query:normalized,
    mealName:String(meal?.name||""),
    index:String(index||0)
  });

  const data=await apiRequest(`/api/images?${params.toString()}`,{
    method:"GET",
    headers:{"Content-Type":"application/json"}
  });

  const result=data?.image||null;
  if(result){
    cache[normalized]=result;
    writeImageCache(cache);
  }
  return result;
}

async function hydrateMealImage(imgId,creditId,loaderId,meal,index){
  const img=document.getElementById(imgId);
  const credit=document.getElementById(creditId);
  const loader=document.getElementById(loaderId);
  if(!img)return;

  img.src=FALLBACK_MEAL_IMAGE;
  img.classList.add("loading-image");

  try{
    const keyword=normalizeImageKeyword(meal);
    const result=await searchMealImage(keyword,meal,index);

    if(!result){
      img.style.display="none";
      const media=img.closest(".meal-media");
      const empty=document.createElement("div");
      empty.className="no-exact-image";
      empty.innerHTML=`<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4Z"/><path d="m4 16 5-5 4 4 2-2 5 5"/></svg><span>${I18N[currentLanguage].noImage}</span>`;
      media.appendChild(empty);
      if(credit)credit.hidden=true;
      return;
    }

    await new Promise((resolve,reject)=>{
      const testImage=new Image();
      let finished=false;

      const timer=setTimeout(()=>{
        if(!finished){
          finished=true;
          reject(new Error("Image load timeout"));
        }
      },12000);

      testImage.onload=()=>{
        if(finished)return;
        finished=true;
        clearTimeout(timer);
        resolve();
      };

      testImage.onerror=()=>{
        if(finished)return;
        finished=true;
        clearTimeout(timer);
        reject(new Error("Image failed to load"));
      };

      testImage.src=result.imageUrl;
    });

    img.src=result.imageUrl;
    img.alt=`صورة ${meal.name||"الوجبة"}`;

    img.onerror=()=>{
      img.onerror=null;
      img.src=FALLBACK_MEAL_IMAGE;
      if(credit)credit.hidden=true;
    };

    if(credit){
      credit.href=result.pageUrl||"#";
      credit.textContent=result.source||"مصدر الصورة";
      credit.title=result.title||"مصدر الصورة";
      credit.hidden=false;
    }

  }catch(error){
    console.warn("Meal image failed:",error);
    img.src=FALLBACK_MEAL_IMAGE;
    if(credit)credit.hidden=true;
  }finally{
    img.classList.remove("loading-image");
    if(loader)loader.remove();
  }
}

function hydrateCurrentDayImages(){
  const day=currentPlan?.days?.[currentDay];
  if(!day)return;
  day.meals.forEach((meal,index)=>{
    hydrateMealImage(
      `meal-image-${currentDay}-${index}`,
      `meal-credit-${currentDay}-${index}`,
      `meal-loader-${currentDay}-${index}`,
      meal,
      index
    );
  });
}

function renderDay(){
 const d=currentPlan.days[currentDay];
 const t=I18N[currentLanguage];
 $("#dayTitle").textContent=d.day;
 $("#dayCalories").textContent=d.totalCalories+" "+t.dayCalories;
 const favs=JSON.parse(localStorage.getItem("healthai_favorites")||"{}");

 $("#mealGrid").innerHTML=d.meals.map((m,i)=>{
   const key=`${currentDay}-${i}`;
   const imageId=`meal-image-${currentDay}-${i}`;
   const creditId=`meal-credit-${currentDay}-${i}`;
   const loaderId=`meal-loader-${currentDay}-${i}`;

   return `<article class="card meal">
     <div class="meal-media">
       <img id="${imageId}" class="meal-img loading-image" src="${FALLBACK_MEAL_IMAGE}" alt="${safe(m.name)}" loading="lazy">
       <div id="${loaderId}" class="image-loader">${t.loadingImage}</div>
       <a id="${creditId}" class="image-credit" href="#" target="_blank" rel="noopener noreferrer" hidden>${t.imageSource}</a>
     </div>
     <div class="meal-body">
       <div class="meal-top">
         <div>
           <h4>${safe(m.name)}</h4>
           <div class="meal-meta">${+m.calories||0} ${t.calories} · ${+m.protein||0} ${t.proteinUnit}</div>
         </div>
         <button class="favorite-btn ${favs[key]?"active":""}" onclick="toggleFavorite('${key}',this)" aria-label="${currentLanguage==="ar"?"إضافة للمفضلة":"Add to favorites"}">
           <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
         </button>
       </div>
       <p><b>${t.ingredients}:</b> ${safe(m.ingredients)}</p>
       <details class="recipe">
         <summary>${t.showRecipe}</summary>
         <ol>${(m.instructions||[]).map(x=>`<li>${safe(x)}</li>`).join("")}</ol>
         <b>${t.difficulty}:</b> ${safe(m.difficulty||"—")}<br>
         <b>${t.alternative}:</b> ${safe(m.alternative||"—")}
       </details>
       <div class="meal-actions">
         <button class="small-btn" onclick="openReplace(${currentDay},${i})">${t.replace}</button>
         <button class="small-btn" onclick="askAboutMeal(${currentDay},${i})">${t.askMeal}</button>
       </div>
     </div>
   </article>`;
 }).join("");

 requestAnimationFrame(hydrateCurrentDayImages);
}


function openReplace(day,meal){replaceTarget={day,meal};$("#replaceMealName").textContent=currentPlan.days[day].meals[meal].name;$("#replaceModal").classList.add("open")}
$("#closeModal").onclick=()=>$("#replaceModal").classList.remove("open");
$("#confirmReplace").onclick=async()=>{try{const old=currentPlan.days[replaceTarget.day].meals[replaceTarget.meal],u=collectData(),type=$("#replaceType").value;$("#confirmReplace").textContent="جارٍ الاستبدال...";const prompt=`اقترح وجبة بديلة عربية ${type}. Your information:${JSON.stringify(u)}. الوجبة الحالية:${JSON.stringify(old)}. احترم الحساسية. أعد JSON فقط بنفس مفاتيح الوجبة الحالية: name,ingredients,calories,protein,carbs,fats,alternative,prepTime,difficulty,instructions,imageKeyword.`;const meal=await geminiText(prompt);currentPlan.days[replaceTarget.day].meals[replaceTarget.meal]=meal;renderPlan(currentPlan);$("#replaceModal").classList.remove("open")}catch(e){showError(e)}finally{$("#confirmReplace").textContent="Create replacement"}};


function formatChatAnswer(text){
  let clean=String(text||"")
    .replace(/\*\*/g,"")
    .replace(/__/g,"")
    .replace(/^\s*#+\s*/gm,"")
    .replace(/^\s*\*\s+/gm,"• ")
    .replace(/^\s*-\s+/gm,"• ")
    .trim();

  const lines=clean.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  let html="",inList=false;

  for(const line of lines){
    if(line.startsWith("• ")){
      if(!inList){html+="<ul>";inList=true}
      html+=`<li>${safe(line.slice(2))}</li>`;
      continue;
    }

    if(inList){html+="</ul>";inList=false}

    const looksLikeTitle =
      line.endsWith(":") ||
      /^(نصيحة|Note|الخلاصة|البدائل|الاقتراح|التعديل|السبب|الخطوات|الوجبة|السعرات|البروتين)/.test(line);

    if(looksLikeTitle){
      html+=`<div class="chat-title">${safe(line.replace(/:$/,""))}</div>`;
    }else{
      html+=`<p>${safe(line)}</p>`;
    }
  }

  if(inList)html+="</ul>";
  return html || "<p>لم يصل رد واضح.</p>";
}

function addMsg(text,type){
  const el=document.createElement("div");
  el.className="msg "+(type==="user"?"user-msg":"ai-msg");

  if(type==="user"){
    el.textContent=text;
  }else{
    el.innerHTML=formatChatAnswer(text);
  }

  $("#chatMessages").appendChild(el);
  $("#chatMessages").scrollTop=$("#chatMessages").scrollHeight;
}

async function sendChat(q){if(!q.trim())return;addMsg(q,"user");$("#chatQuestion").value="";addMsg("جاري التفكير...","ai");const loadingMsg=$("#chatMessages").lastChild;try{const context={user:collectData(),calculations:currentPlan?.calc,currentDay:currentPlan?.days?.[currentDay]};const answer=await geminiText(`أنت مساعد تغذية تعليمي حذر. السياق:${JSON.stringify(context)}. سؤال المستخدم:${q}. أجب باللغة الحالية للواجهة: ${currentLanguage==="ar"?"العربية":"English"}. استخدم عناوين قصيرة ونقاط تبدأ بشرطة فقط. لا تستخدم نجوم Markdown ولا رموز ** ولا جداول Markdown. لا تشخص مرضًا ولا تغير دواء.`,false);loadingMsg.textContent=answer}catch(e){loadingMsg.textContent=e.message}}
$("#chatSend").onclick=()=>sendChat($("#chatQuestion").value);$("#chatQuestion").addEventListener("keydown",e=>{if(e.key==="Enter")sendChat(e.target.value)});
function askAboutMeal(d,m){const meal=currentPlan.days[d].meals[m];$("#chatQuestion").value=`اشرح لي وجبة ${meal.name} واقترح تعديلًا مناسبًا لها`;$("#chatQuestion").focus();document.querySelector(".chat").scrollIntoView({behavior:"smooth"})}

function saveUser(){localStorage.setItem(STORE.user,JSON.stringify(collectData()))}
function loadUser(){const u=JSON.parse(localStorage.getItem(STORE.user)||"null");if(!u)return;const map={name:u.name,gender:u.gender,age:u.age,height:u.heightCm,weight:u.weightKg,goalWeight:u.goalWeightKg,goal:u.goal,activity:u.activityFactor,meals:u.mealsPerDay,budget:u.budget,likes:u.favoriteFoods,avoid:u.excludedFoodsAndAllergies,medical:u.medicalNotes};Object.entries(map).forEach(([id,v])=>{if(v!==undefined&&$("#"+id))$("#"+id).value=v});const radio=document.querySelector(`input[name=diet][value="${CSS.escape(u.dietType||"عادي")}"]`);if(radio)radio.checked=true}

function progressData(){return JSON.parse(localStorage.getItem(STORE.progress)||"[]")}
function saveProgress(x){localStorage.setItem(STORE.progress,JSON.stringify(x));renderProgress()}
$("#addProgress").onclick=()=>{const d=progressData(),row={date:$("#progressDate").value,weight:+$("#progressWeight").value,waist:+$("#progressWaist").value,note:$("#progressNote").value.trim()};if(!row.date||!row.weight)return alert("أدخل Date وWeight");d.push(row);d.sort((a,b)=>a.date.localeCompare(b.date));saveProgress(d);$("#progressWeight").value="";$("#progressWaist").value="";$("#progressNote").value=""}
function removeProgress(i){const d=progressData();d.splice(i,1);saveProgress(d)}
function renderProgress(){
 const d=progressData();
 const lang=currentLanguage;
 $("#progressList").innerHTML=d.map((x,i)=>`
   <div class="progress-row">
     <span>${safe(x.date)}</span>
     <span>${x.weight} ${lang==="ar"?"كجم":"kg"}</span>
     <span>${x.waist||"—"} ${lang==="ar"?"سم":"cm"}</span>
     <button class="small-btn" onclick="removeProgress(${i})">${lang==="ar"?"حذف":"Delete"}</button>
   </div>`).join("");

 if(!d.length){$("#progressSummary").textContent=I18N[currentLanguage].noData;
   $("#chart").innerHTML=`<p style="text-align:center;color:var(--muted)">${lang==="ar"?"أضف قياسات لعرض المخطط.":"Add measurements to display the chart."}</p>`;
   $("#progressSummary").textContent=lang==="ar"?"لا توجد بيانات":"No data yet";
   return;
 }

 const weightDiff=(d[d.length-1].weight-d[0].weight).toFixed(1);
 $("#progressSummary").textContent=(lang==="ar"?"تغير الوزن ":"Weight change ")+(weightDiff>0?"+":"")+weightDiff+(lang==="ar"?" كجم":" kg");

 const W=720,H=220,pad=34;
 const weights=d.map(x=>+x.weight).filter(Number.isFinite);
 const waists=d.map(x=>+x.waist).filter(x=>Number.isFinite(x)&&x>0);
 const all=[...weights,...waists];
 const min=Math.min(...all)-2,max=Math.max(...all)+2,range=max-min||1;
 const x=(i)=>pad+(i/Math.max(1,d.length-1))*(W-pad*2);
 const y=(v)=>H-pad-((v-min)/range)*(H-pad*2);

 const weightPts=d.map((row,i)=>`${x(i)},${y(+row.weight)}`).join(" ");
 const waistPts=d.filter(row=>+row.waist>0).map(row=>{
   const i=d.indexOf(row);return `${x(i)},${y(+row.waist)}`
 }).join(" ");

 $("#chart").innerHTML=`
 <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Progress chart">
   ${[0,.25,.5,.75,1].map(r=>`<line x1="${pad}" y1="${pad+r*(H-pad*2)}" x2="${W-pad}" y2="${pad+r*(H-pad*2)}" stroke="#dfe9e4" stroke-width="1"/>`).join("")}
   <polyline points="${weightPts}" fill="none" stroke="#0b6b4b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
   ${waistPts?`<polyline points="${waistPts}" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`:""}
   ${d.map((row,i)=>`<circle cx="${x(i)}" cy="${y(+row.weight)}" r="5" fill="#0b6b4b"><title>${row.date}: ${row.weight}</title></circle>`).join("")}
   ${d.filter(row=>+row.waist>0).map(row=>{const i=d.indexOf(row);return`<circle cx="${x(i)}" cy="${y(+row.waist)}" r="4" fill="#f59e0b"><title>${row.date}: ${row.waist}</title></circle>`}).join("")}
 </svg>
 <div class="chart-legend">
   <span>${lang==="ar"?"الوزن":"Weight"}</span>
   <span class="waist">${lang==="ar"?"محيط الخصر":"Waist"}</span>
 </div>`;
}


let planLoadingTimer=null;
let planLoadingStarted=0;

function updateLoadingTimer(){
  const elapsed=Math.floor((Date.now()-planLoadingStarted)/1000);
  if($("#loadingSeconds"))$("#loadingSeconds").textContent=elapsed+"s";

  const steps=[$("#loadStep1"),$("#loadStep2"),$("#loadStep3")];
  steps.forEach(x=>x&&x.classList.remove("active"));
  if(elapsed<5)steps[0]?.classList.add("active");
  else if(elapsed<12)steps[1]?.classList.add("active");
  else steps[2]?.classList.add("active");
}

function setLoading(v){
  $("#errorBox").style.display="none";
  $("#empty").style.display=v?"none":$("#empty").style.display;
  $("#results").style.display=v?"none":$("#results").style.display;
  $("#loading").style.display=v?"block":"none";

  clearInterval(planLoadingTimer);
  planLoadingTimer=null;

  if(v){
    planLoadingStarted=Date.now();
    updateLoadingTimer();
    planLoadingTimer=setInterval(updateLoadingTimer,1000);
  }
}
function showError(e){clearInterval(planLoadingTimer);planLoadingTimer=null;$("#loading").style.display="none";$("#errorBox").textContent=e?.message||"حدث خطأ";$("#errorBox").style.display="block";$("#errorBox").scrollIntoView({behavior:"smooth"})}
$("#nutritionForm").addEventListener("submit",async e=>{e.preventDefault();setLoading(true);try{const u=collectData(),c=calculateNutrition(u),warnings=healthWarnings(u,c),raw=await geminiText(weeklyPrompt(u,c));const p=validatePlan(raw,u,c);if(warnings.length)p.medicalWarning=warnings.join(" ");renderPlan(p)}catch(e){showError(e)}});



let selectedFoodImage=null;

function fileToCompressedBase64(file,maxSide=1280,quality=.82){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("تعذر قراءة الصورة."));
    reader.onload=()=>{
      const image=new Image();
      image.onerror=()=>reject(new Error("الصورة غير صالحة."));
      image.onload=()=>{
        let width=image.width,height=image.height;
        const scale=Math.min(1,maxSide/Math.max(width,height));
        width=Math.round(width*scale);
        height=Math.round(height*scale);

        const canvas=document.createElement("canvas");
        canvas.width=width;
        canvas.height=height;
        const ctx=canvas.getContext("2d");
        ctx.drawImage(image,0,0,width,height);

        const mimeType="image/jpeg";
        const dataUrl=canvas.toDataURL(mimeType,quality);
        resolve({
          mimeType,
          base64:dataUrl.split(",")[1],
          previewUrl:dataUrl,
          originalName:file.name||"camera-image.jpg"
        });
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function geminiVision(prompt,imageData){
  const data=await apiRequest("/api/gemini",{
    method:"POST",
    body:JSON.stringify({
      mode:"vision",
      prompt,
      image:{
        mimeType:imageData.mimeType,
        base64:imageData.base64
      },
      json:true
    })
  });

  return data.result;
}

function foodAnalysisPrompt(){
  const answerLanguage=currentLanguage==="ar"?"العربية":"English";
  return `حلل صورة الوجبة بصريًا بشكل تقديري وحذر، واكتب النتيجة باللغة ${answerLanguage}.
أعد JSON فقط بهذا الشكل:
{
  "title":"",
  "identifiedDish":"",
  "confidence":"منخفضة أو متوسطة أو مرتفعة",
  "summary":"",
  "ingredients":[
    {"name":"","estimatedQuantity":"","calories":0}
  ],
  "totalCalories":0,
  "protein":0,
  "carbs":0,
  "fats":0,
  "notes":[""],
  "warning":""
}
القواعد:
- اذكر أن التقدير من صورة واحدة وقد يختلف بسبب الكميات والزيوت وطريقة التحضير.
- لا تدّعي معرفة وزن أو مكون غير ظاهر يقينًا.
- اعط نطاقًا أو تقديرًا محافظًا عند عدم الوضوح داخل النصوص.
- القيم الغذائية بالجرام، والسعرات kcal.
- أجب بالعربية، ولا تستخدم Markdown خارج JSON.`;
}

function renderFoodAnalysis(result){
  const t=I18N[currentLanguage];
  const ingredients=Array.isArray(result.ingredients)?result.ingredients:[];
  const notes=Array.isArray(result.notes)?result.notes:[];

  $("#foodAnalysisResult").innerHTML=`
    <div class="analysis-head">
      <h4>${safe(result.identifiedDish||result.title||t.analysisTitle)}</h4>
      <p>${safe(result.summary||t.estimated)}</p>
      <p style="margin-top:6px"><b>${t.confidence}:</b> ${safe(result.confidence||t.estimated)}</p>
    </div>
    <div class="analysis-macros">
      <div class="analysis-macro"><b>${+result.totalCalories||0}</b><span>${t.approxCalories}</span></div>
      <div class="analysis-macro"><b>${+result.protein||0} ${t.grams}</b><span>${t.protein}</span></div>
      <div class="analysis-macro"><b>${+result.carbs||0} ${t.grams}</b><span>${t.carbs}</span></div>
      <div class="analysis-macro"><b>${+result.fats||0} ${t.grams}</b><span>${t.fats}</span></div>
    </div>
    <div class="ingredients-analysis">
      ${ingredients.length?ingredients.map(item=>`
        <div class="ingredient-analysis-row">
          <strong>${safe(item.name)}</strong>
          <span>${safe(item.estimatedQuantity||t.estimated)}</span>
          <span>${+item.calories||0} kcal</span>
        </div>
      `).join(""):`<div class="ingredient-analysis-row"><span>${currentLanguage==="ar"?"لم يتم التعرف على مكونات واضحة.":"No clear ingredients were identified."}</span></div>`}
    </div>
    <div class="analysis-notes">
      ${notes.map(note=>`<div>• ${safe(note)}</div>`).join("")}
      <div style="margin-top:6px"><b>${t.warning}:</b> ${safe(result.warning|| (currentLanguage==="ar"?"القيم تقديرية وليست بديلًا عن مختص التغذية.":"Values are estimates and not a substitute for a nutrition professional."))}</div>
    </div>`;
  $("#foodAnalysisResult").hidden=false;
}

async function selectFoodImage(file){
  if(!file)return;
  if(!file.type.startsWith("image/")){
    showError(new Error("اختر ملف صورة فقط."));
    return;
  }
  if(file.size>12*1024*1024){
    showError(new Error("حجم الصورة كبير. اختر صورة أقل من 12 ميجابايت."));
    return;
  }

  try{
    selectedFoodImage=await fileToCompressedBase64(file);
    $("#foodPreview").src=selectedFoodImage.previewUrl;
    $("#foodPreviewWrap").hidden=false;
    $("#analyzeFoodBtn").disabled=false;
    $("#foodAnalysisResult").hidden=true;
  }catch(error){
    showError(error);
  }
}

$("#galleryInput")?.addEventListener("change",event=>{
  selectFoodImage(event.target.files?.[0]);
});
$("#cameraInput")?.addEventListener("change",event=>{
  selectFoodImage(event.target.files?.[0]);
});
$("#removeFoodImage")?.addEventListener("click",()=>{
  selectedFoodImage=null;
  $("#foodPreview").removeAttribute("src");
  $("#foodPreviewWrap").hidden=true;
  $("#analyzeFoodBtn").disabled=true;
  $("#foodAnalysisResult").hidden=true;
  $("#foodAnalyzeLoading").hidden=true;
  $("#foodAnalyzeLoading").setAttribute("aria-hidden","true");
  $("#galleryInput").value="";
  $("#cameraInput").value="";
});
$("#analyzeFoodBtn")?.addEventListener("click",async()=>{
  if(!selectedFoodImage)return;

  $("#analyzeFoodBtn").disabled=true;
  $("#foodAnalyzeLoading").hidden=false;
  $("#foodAnalyzeLoading").setAttribute("aria-hidden","false");
  $("#foodAnalysisResult").hidden=true;

  try{
    const result=await geminiVision(foodAnalysisPrompt(),selectedFoodImage);
    renderFoodAnalysis(result);
  }catch(error){
    showError(error);
  }finally{
    $("#foodAnalyzeLoading").hidden=true;
    $("#foodAnalyzeLoading").setAttribute("aria-hidden","true");
    $("#analyzeFoodBtn").disabled=false;
  }
});


let currentLanguage=localStorage.getItem(STORE.language)||"en";

const I18N={
  en:{
    languageLabel:"EN",
    brandSubtitle:"Your smart health assistant",
    homeHeroEyebrow:"Daily and weekly nutrition",
    homeHeroTitle:"Smarter nutrition, <span>clearer results</span>",
    homeHeroText:"Create your plan, track progress and manage meals in one place.",
    homeWelcomeTitle:"All your health tools in one place",
    homeWelcomeText:"Build a nutrition plan, chat with the assistant, analyze a meal photo or track your measurements.",
    homePlanTitle:"Nutrition Plan",homePlanText:"Create a complete weekly plan",
    homeChatTitle:"Chat",homeChatText:"Ask about meals and nutrition",
    homeAnalyzeTitle:"Photo Analysis",homeAnalyzeText:"Estimate ingredients and calories",
    homeProgressTitle:"Progress",homeProgressText:"Track weight and measurements",
    dailyScore:"Daily score",water:"Water",
    planPageTitle:"Nutrition Plan",planDaysBadge:"7 days",
    formTitle:"Your information",autoSaved:"Auto-saved",
    name:"Name",gender:"Gender",age:"Age",height:"Height (cm)",weight:"Weight (kg)",
    targetWeight:"Target weight",goal:"Goal",activity:"Activity",meals:"Meals per day",
    budget:"Budget",diet:"Diet style",likes:"Favorite foods",avoid:"Allergies or excluded foods",
    medical:"Health notes",targetCalories:"Target calories",protein:"Protein",estimatedWater:"Estimated water",
    createPlan:"Create 7-day plan",emptyTitle:"Your plan will appear here",
    emptyText:"Complete your information, then create a personalized seven-day nutrition plan.",
    loadingTitle:"Creating your weekly plan",loadingText:"Preparing meals, nutrition targets and recipes.",
    load1:"Calculating targets",load2:"Building meals",load3:"Finalizing plan",
    tipsTitle:"Plan tips",
    analyzerPageTitle:"Meal Photo Analysis",analyzerCardTitle:"Meal Photo Analysis",
    analyzerSubtitle:"Upload a photo or use the camera to estimate ingredients and nutrition.",
    chooseDevice:"Choose from device",openCamera:"Open camera",analyzeMeal:"Analyze meal",
    analyzingMeal:"Analyzing meal...",removeImage:"Remove image",mealPreview:"Meal preview",
    chatPageTitle:"Chat",chatBadge:"Smart assistant",chatTitle:"Ask HealthAi",
    chatContext:"Uses your current plan",chatPlaceholder:"Example: I ate dessert. How should I adjust the rest of my day?",
    send:"Send",
    progressPageTitle:"Progress",progressPageBadge:"Your measurements",progressTitle:"Weight and measurements",
    date:"Date",waist:"Waist",note:"Note",addEntry:"Add entry",noData:"No data yet",
    replaceTitle:"Replace meal",replaceType:"Replacement type",createReplacement:"Create replacement",cancel:"Cancel",
    navHome:"Home",navPlan:"Plan",navChat:"Chat",navAnalyze:"Analyze",navProgress:"Progress",
    drawerEyebrow:"Personal diary",drawerTitle:"Meal calendar",mealDateLabel:"Date",mealTypeLabel:"Meal type",
    mealNameLabel:"Meal",mealCaloriesLabel:"Calories",mealProteinLabel:"Protein (g)",saveMeal:"Save meal",
    mealNamePlaceholder:"e.g. grilled chicken and rice",noMeals:"No meals saved for this date.",delete:"Delete",
    breakfast:"Breakfast",lunch:"Lunch",dinner:"Dinner",snack:"Snack",
    chatWelcome:"I can help with:\n• Meal alternatives\n• Calorie adjustments\n• Increasing protein\n• Organizing the day after an extra meal",
    requiredMeal:"Enter a meal name first.",saved:"Meal saved locally.",
    calories:"calories",proteinUnit:"g protein",ingredients:"Ingredients",showRecipe:"Show preparation",
    difficulty:"Difficulty",alternative:"Alternative",replace:"Replace",askMeal:"Ask about it",
    noImage:"No reliable matching image",loadingImage:"Loading a suitable meal image...",
    imageSource:"Image source",dayCalories:"calories",grams:"g",liters:"L",
    analysisTitle:"Meal analysis",confidence:"Confidence",approxCalories:"Approx. calories",
    carbs:"Carbs",fats:"Fats",warning:"Warning",estimated:"Estimated",
    low:"Low",medium:"Medium",high:"High",
    progressEmpty:"Add measurements to display the chart.",weightChange:"Weight change",
    kg:"kg",cm:"cm",weightLegend:"Weight",waistLegend:"Waist"
  },
  ar:{
    languageLabel:"AR",
    brandSubtitle:"مساعدك الصحي الذكي",
    homeHeroEyebrow:"تغذية يومية وأسبوعية",
    homeHeroTitle:"تغذية أذكى، <span>نتائج أوضح</span>",
    homeHeroText:"أنشئ خطتك، تابع تقدمك ونظّم وجباتك في مكان واحد.",
    homeWelcomeTitle:"كل أدواتك الصحية في مكان واحد",
    homeWelcomeText:"أنشئ خطة غذائية، تحدث مع المساعد، حلّل صورة وجبتك أو تابع قياساتك.",
    homePlanTitle:"الخطة الغذائية",homePlanText:"أنشئ خطة أسبوعية كاملة",
    homeChatTitle:"المحادثة",homeChatText:"اسأل عن الوجبات والتغذية",
    homeAnalyzeTitle:"تحليل الصورة",homeAnalyzeText:"قدّر المكونات والسعرات",
    homeProgressTitle:"التقدم",homeProgressText:"تابع الوزن والقياسات",
    dailyScore:"التزام اليوم",water:"المياه",
    planPageTitle:"الخطة الغذائية",planDaysBadge:"7 أيام",
    formTitle:"بياناتك",autoSaved:"حفظ تلقائي",
    name:"الاسم",gender:"النوع",age:"العمر",height:"الطول (سم)",weight:"الوزن (كجم)",
    targetWeight:"الوزن المستهدف",goal:"الهدف",activity:"النشاط",meals:"عدد الوجبات يوميًا",
    budget:"الميزانية",diet:"نوع النظام",likes:"الأطعمة المفضلة",avoid:"الحساسية أو الأطعمة المستبعدة",
    medical:"ملاحظات صحية",targetCalories:"سعرات الهدف",protein:"البروتين",estimatedWater:"المياه التقريبية",
    createPlan:"إنشاء خطة 7 أيام",emptyTitle:"ستظهر خطتك هنا",
    emptyText:"أكمل بياناتك ثم أنشئ خطة غذائية مخصصة لمدة سبعة أيام.",
    loadingTitle:"يتم إنشاء خطتك الأسبوعية",loadingText:"نجهز الوجبات والأهداف الغذائية والوصفات.",
    load1:"حساب الاحتياجات",load2:"تجهيز الوجبات",load3:"إنهاء الخطة",
    tipsTitle:"نصائح الخطة",
    analyzerPageTitle:"تحليل صورة الوجبة",analyzerCardTitle:"تحليل صورة الوجبة",
    analyzerSubtitle:"ارفع صورة أو استخدم الكاميرا لتقدير المكونات والقيم الغذائية.",
    chooseDevice:"اختيار من الجهاز",openCamera:"فتح الكاميرا",analyzeMeal:"تحليل الوجبة",
    analyzingMeal:"يتم تحليل الوجبة...",removeImage:"حذف الصورة",mealPreview:"معاينة الوجبة",
    chatPageTitle:"المحادثة",chatBadge:"مساعد ذكي",chatTitle:"اسأل HealthAi",
    chatContext:"يعتمد على خطتك الحالية",chatPlaceholder:"مثال: أكلت حلوى، كيف أعدّل باقي اليوم؟",
    send:"إرسال",
    progressPageTitle:"التقدم",progressPageBadge:"قياساتك",progressTitle:"الوزن والقياسات",
    date:"التاريخ",waist:"محيط الخصر",note:"ملاحظة",addEntry:"إضافة قياس",noData:"لا توجد بيانات",
    replaceTitle:"استبدال الوجبة",replaceType:"نوع البديل",createReplacement:"إنشاء البديل",cancel:"إلغاء",
    navHome:"الرئيسية",navPlan:"الخطة",navChat:"المحادثة",navAnalyze:"التحليل",navProgress:"التقدم",
    drawerEyebrow:"مذكرتك الشخصية",drawerTitle:"تقويم الوجبات",mealDateLabel:"التاريخ",mealTypeLabel:"نوع الوجبة",
    mealNameLabel:"الوجبة",mealCaloriesLabel:"السعرات",mealProteinLabel:"البروتين (جم)",saveMeal:"حفظ الوجبة",
    mealNamePlaceholder:"مثال: فراخ مشوية وأرز",noMeals:"لا توجد وجبات محفوظة لهذا التاريخ.",delete:"حذف",
    breakfast:"الإفطار",lunch:"الغداء",dinner:"العشاء",snack:"وجبة خفيفة",
    chatWelcome:"أقدر أساعدك في:\n• بدائل الوجبات\n• تعديل السعرات\n• زيادة البروتين\n• تنظيم اليوم بعد وجبة زائدة",
    requiredMeal:"اكتب اسم الوجبة أولًا.",saved:"تم حفظ الوجبة محليًا.",
    calories:"سعرة",proteinUnit:"جم بروتين",ingredients:"المكونات",showRecipe:"عرض طريقة التحضير",
    difficulty:"الصعوبة",alternative:"البديل",replace:"استبدال",askMeal:"اسأل عنها",
    noImage:"لا توجد صورة مطابقة موثوقة",loadingImage:"جارٍ تحميل صورة مناسبة للوجبة...",
    imageSource:"مصدر الصورة",dayCalories:"سعرة",grams:"جم",liters:"لتر",
    analysisTitle:"تحليل الوجبة",confidence:"درجة الثقة",approxCalories:"سعرات تقريبية",
    carbs:"كربوهيدرات",fats:"دهون",warning:"تنبيه",estimated:"تقديري",
    low:"منخفضة",medium:"متوسطة",high:"مرتفعة",
    progressEmpty:"أضف قياسات لعرض المخطط.",weightChange:"تغير الوزن",
    kg:"كجم",cm:"سم",weightLegend:"الوزن",waistLegend:"محيط الخصر"
  }
};

function setText(id,value,html=false){
  const el=document.getElementById(id);
  if(!el)return;
  if(html)el.innerHTML=value;else el.textContent=value;
}

function updateOptionLabels(lang){
  const index=lang==="ar"?1:0;
  const maps={
    gender:{ذكر:["Male","ذكر"],أنثى:["Female","أنثى"]},
    goal:{"خسارة الدهون":["Fat loss","خسارة الدهون"],"بناء العضلات":["Muscle gain","بناء العضلات"],"تثبيت الوزن":["Maintain weight","تثبيت الوزن"],"زيادة الوزن":["Weight gain","زيادة الوزن"]},
    budget:{اقتصادية:["Budget","اقتصادية"],متوسطة:["Standard","متوسطة"],مرنة:["Flexible","مرنة"]},
    activity:{"1.2":["Low activity","نشاط قليل"],"1.375":["Light — 1 to 3 days","خفيف — 1 إلى 3 أيام"],"1.55":["Moderate — 3 to 5 days","متوسط — 3 إلى 5 أيام"],"1.725":["High — 6 days","نشاط عالٍ — 6 أيام"]}
  };
  Object.entries(maps).forEach(([id,map])=>{
    const select=document.getElementById(id);if(!select)return;
    [...select.options].forEach(opt=>{if(map[opt.value])opt.textContent=map[opt.value][index]});
  });
  const diet={عادي:["Balanced","عادي"],نباتي:["Vegetarian","نباتي"],كيتو:["Keto","كيتو"],"صيام متقطع":["Intermittent fasting","صيام متقطع"]};
  document.querySelectorAll("[data-diet-label]").forEach(el=>{
    const value=el.dataset.dietLabel;
    if(diet[value])el.textContent=diet[value][index];
  });
}

function updateDiaryOptions(lang){
  const t=I18N[lang];
  const labels={Breakfast:t.breakfast,Lunch:t.lunch,Dinner:t.dinner,Snack:t.snack};
  const select=$("#mealDiaryType");
  if(select)[...select.options].forEach(opt=>{if(labels[opt.value])opt.textContent=labels[opt.value]});
}

function updateReplaceOptions(lang){
  const sets={
    en:["Similar calories and protein","Lower cost","Faster preparation","No cooking","Higher protein","Lower carbs"],
    ar:["بنفس السعرات والبروتين تقريبًا","أقل تكلفة","أسرع في التحضير","بدون طبخ","بروتين أعلى","كربوهيدرات أقل"]
  };
  const select=$("#replaceType");
  if(select)[...select.options].forEach((opt,index)=>{opt.textContent=sets[lang][index]||opt.textContent});
}

function applyLanguage(lang){
  currentLanguage=lang==="ar"?"ar":"en";
  localStorage.setItem(STORE.language,currentLanguage);
  document.documentElement.lang=currentLanguage;
  document.documentElement.dir=currentLanguage==="ar"?"rtl":"ltr";
  document.body.classList.toggle("lang-ar",currentLanguage==="ar");
  document.body.classList.toggle("lang-en",currentLanguage==="en");
  const t=I18N[currentLanguage];

  const textMap={
    brandSubtitle:t.brandSubtitle,languageLabel:t.languageLabel,
    homeHeroEyebrow:t.homeHeroEyebrow,homeWelcomeTitle:t.homeWelcomeTitle,homeWelcomeText:t.homeWelcomeText,
    homePlanTitle:t.homePlanTitle,homePlanText:t.homePlanText,homeChatTitle:t.homeChatTitle,homeChatText:t.homeChatText,
    homeAnalyzeTitle:t.homeAnalyzeTitle,homeAnalyzeText:t.homeAnalyzeText,homeProgressTitle:t.homeProgressTitle,homeProgressText:t.homeProgressText,
    planPageTitle:t.planPageTitle,planDaysBadge:t.planDaysBadge,formTitle:t.formTitle,autoSavedBadge:t.autoSaved,
    labelName:t.name,labelGender:t.gender,labelAge:t.age,labelHeight:t.height,labelWeight:t.weight,
    labelTargetWeight:t.targetWeight,labelGoal:t.goal,labelActivity:t.activity,labelMeals:t.meals,labelBudget:t.budget,
    labelDiet:t.diet,labelLikes:t.likes,labelAvoid:t.avoid,labelMedical:t.medical,createPlanBtn:t.createPlan,
    emptyTitle:t.emptyTitle,emptyText:t.emptyText,loadingTitle:t.loadingTitle,loadingText:t.loadingText,
    loadStep1:t.load1,loadStep2:t.load2,loadStep3:t.load3,tipsTitle:t.tipsTitle,
    analyzerPageTitle:t.analyzerPageTitle,analyzerCardTitle:t.analyzerCardTitle,analyzerSubtitle:t.analyzerSubtitle,
    chooseDeviceText:t.chooseDevice,openCameraText:t.openCamera,analyzeFoodBtnText:t.analyzeMeal,foodAnalyzingText:t.analyzingMeal,
    chatPageTitle:t.chatPageTitle,chatBadge:t.chatBadge,chatTitle:t.chatTitle,chatContextBadge:t.chatContext,chatSend:t.send,
    progressPageTitle:t.progressPageTitle,progressPageBadge:t.progressPageBadge,progressTitle:t.progressTitle,
    labelProgressDate:t.date,labelProgressWeight:t.weight,labelProgressWaist:t.waist,labelProgressNote:t.note,addProgress:t.addEntry,
    replaceModalTitle:t.replaceTitle,replaceTypeLabel:t.replaceType,confirmReplace:t.createReplacement,closeModal:t.cancel,
    navHome:t.navHome,navPlan:t.navPlan,navChat:t.navChat,navAnalyze:t.navAnalyze,navProgress:t.navProgress,
    drawerEyebrow:t.drawerEyebrow,drawerTitle:t.drawerTitle,mealDateLabel:t.mealDateLabel,mealTypeLabel:t.mealTypeLabel,
    mealNameLabel:t.mealNameLabel,mealCaloriesLabel:t.mealCaloriesLabel,mealProteinLabel:t.mealProteinLabel,
    saveMealDiaryBtn:t.saveMeal
  };
  Object.entries(textMap).forEach(([id,value])=>setText(id,value));
  setText("homeHeroTitle",t.homeHeroTitle,true);

  document.querySelectorAll('[data-i18n="dailyScore"]').forEach(el=>el.textContent=t.dailyScore);
  document.querySelectorAll('[data-i18n="water"]').forEach(el=>el.textContent=t.water);
  document.querySelectorAll('[data-i18n="targetCalories"]').forEach(el=>el.textContent=t.targetCalories);
  document.querySelectorAll('[data-i18n="protein"]').forEach(el=>el.textContent=t.protein);
  document.querySelectorAll('[data-i18n="estimatedWater"]').forEach(el=>el.textContent=t.estimatedWater);

  if($("#chatQuestion"))$("#chatQuestion").placeholder=t.chatPlaceholder;
  if($("#mealDiaryName"))$("#mealDiaryName").placeholder=t.mealNamePlaceholder;
  if($("#foodPreview"))$("#foodPreview").alt=t.mealPreview;
  if($("#removeFoodImage"))$("#removeFoodImage").setAttribute("aria-label",t.removeImage);
  if($("#languageBtn"))$("#languageBtn").setAttribute("aria-label",currentLanguage==="ar"?"تبديل اللغة":"Switch language");

  updateOptionLabels(currentLanguage);
  updateDiaryOptions(currentLanguage);
  updateReplaceOptions(currentLanguage);

  renderMealDiary();
  renderProgress();
  if(currentPlan){renderPlan(currentPlan)}

  if($("#chatMessages")){
    const onlyWelcome=$("#chatMessages").children.length<=1;
    if(onlyWelcome){
      $("#chatMessages").innerHTML="";
      addMsg(t.chatWelcome,"ai");
    }
  }
}

function diaryData(){
  try{return JSON.parse(localStorage.getItem(STORE.diary)||"[]")}catch{return[]}
}
function saveDiaryData(data){
  localStorage.setItem(STORE.diary,JSON.stringify(data));
}
function formatDiaryDate(value){
  if(!value)return"";
  return new Intl.DateTimeFormat(currentLanguage==="ar"?"ar-EG":"en-US",{weekday:"short",year:"numeric",month:"short",day:"numeric"}).format(new Date(value+"T12:00:00"));
}
function renderMealDiary(){
  const date=$("#mealDiaryDate")?.value;
  if(!date)return;
  setText("selectedDiaryDate",formatDiaryDate(date));
  const rows=diaryData().filter(x=>x.date===date).sort((a,b)=>a.createdAt-b.createdAt);
  $("#mealDiaryList").innerHTML=rows.length?rows.map(row=>`
    <article class="diary-item">
      <div class="diary-item-top">
        <div><h4>${safe(row.name)}</h4><small>${safe(row.type)}</small></div>
        <button class="diary-delete" onclick="deleteDiaryMeal('${row.id}')">${I18N[currentLanguage].delete}</button>
      </div>
      <div class="diary-meta">
        <span>${row.calories||0} kcal</span>
        <span>${row.protein||0} g protein</span>
      </div>
    </article>`).join(""):`<div class="diary-empty">${I18N[currentLanguage].noMeals}</div>`;
}
function deleteDiaryMeal(id){
  saveDiaryData(diaryData().filter(x=>x.id!==id));
  renderMealDiary();
}
function shiftDiaryDate(days){
  const input=$("#mealDiaryDate");
  const d=new Date((input.value||new Date().toISOString().slice(0,10))+"T12:00:00");
  d.setDate(d.getDate()+days);
  input.value=d.toISOString().slice(0,10);
  renderMealDiary();
}

$("#languageBtn")?.addEventListener("click",event=>{
  event.preventDefault();
  applyLanguage(currentLanguage==="en"?"ar":"en");
});


function toggleFavorite(key,btn){
  const favs=JSON.parse(localStorage.getItem("healthai_favorites")||"{}");
  favs[key]=!favs[key];
  localStorage.setItem("healthai_favorites",JSON.stringify(favs));
  btn.classList.toggle("active",!!favs[key]);
  updateCommitment();
}

function getWater(){
  return +(localStorage.getItem("healthai_water_today")||0);
}
function setWater(v){
  const next=Math.max(0,Math.min(12,v));
  localStorage.setItem("healthai_water_today",next);
  if($("#waterCount"))$("#waterCount").textContent=next;
  if($("#homeWaterCount"))$("#homeWaterCount").textContent=next;
  updateCommitment();
}
function updateCommitment(){
  const water=Math.min(getWater(),8)/8;
  const progress=progressData().length?1:0;
  const plan=currentPlan?1:0;
  const favs=Object.values(JSON.parse(localStorage.getItem("healthai_favorites")||"{}")).filter(Boolean).length;
  const favoriteScore=Math.min(favs,2)/2;
  const percent=Math.round((water*.45+progress*.2+plan*.25+favoriteScore*.1)*100);
  if($("#dailyCommitment"))$("#dailyCommitment").textContent=percent+"%";
  if($("#ringValue"))$("#ringValue").textContent=percent;
  if($("#homeCommitment"))$("#homeCommitment").textContent=percent+"%";
  if($("#homeRingValue"))$("#homeRingValue").textContent=percent;
  document.querySelectorAll(".progress-ring").forEach(r=>r.style.setProperty("--value",percent));
}
$("#addWaterBtn")?.addEventListener("click",()=>setWater(getWater()+1));
$("#homeAddWaterBtn")?.addEventListener("click",()=>setWater(getWater()+1));
$("#waterQuickBtn")?.addEventListener("click",()=>{
  document.querySelector(".mobile-dashboard")?.scrollIntoView({behavior:"smooth",block:"center"});
});


function openPage(pageId){
  if(!document.getElementById(pageId))pageId="page-home";

  document.querySelectorAll(".app-page").forEach(page=>{
    page.classList.toggle("active",page.id===pageId);
  });
  document.querySelectorAll(".bottom-item").forEach(item=>{
    item.classList.toggle("active",item.dataset.page===pageId);
  });
  window.scrollTo({top:0,behavior:"smooth"});
  localStorage.setItem("healthai_active_page",pageId);
}

document.querySelectorAll(".bottom-item").forEach(btn=>{
  btn.addEventListener("click",()=>openPage(btn.dataset.page));
});

document.querySelectorAll("[data-page-target]").forEach(btn=>{
  btn.addEventListener("click",()=>openPage(btn.dataset.pageTarget));
});

// ربط احتياطي يعمل حتى لو تغير ترتيب العناصر لاحقًا
document.addEventListener("click",event=>{
  if(event.target.closest("#languageBtn"))return;

  const navButton=event.target.closest(".bottom-item[data-page]");
  if(navButton){
    event.preventDefault();
    openPage(navButton.dataset.page);
    return;
  }

  const pageButton=event.target.closest("[data-page-target]");
  if(pageButton){
    event.preventDefault();
    openPage(pageButton.dataset.pageTarget);
  }
});


// ---------- Smart Tools ----------
const TOOL_STORE={
  daily:"healthai_daily_log_v1",
  pantry:"healthai_pantry_v1",
  reminders:"healthai_reminders_v1",
  ramadan:"healthai_ramadan_v1",
  points:"healthai_points_v1",
  streak:"healthai_streak_v1"
};

const TOOL_I18N={
  en:{
    toolsTitle:"Smart Tools",localBadge:"Saved locally",commandCenter:"Health command center",
    toolsHeroTitle:"Everything you need for a healthier day",
    toolsHeroText:"Track meals, use your pantry, compare choices, create reminders and review your weekly progress.",
    points:"Points",dailyTracker:"Daily Tracker",pantry:"Pantry",coach:"Coach",reports:"Reports",
    caloriesToday:"Calories today",proteinToday:"Protein today",waterToday:"Water today",
    quickLog:"Quick log",addMeal:"Add a meal",mealName:"Meal name",calories:"Calories",protein:"Protein",
    mealType:"Meal type",addToToday:"Add to today",todayLog:"Today log",mealsAndMacros:"Meals & macros",
    clear:"Clear",challenge:"Daily challenge",challengeTitle:"Complete your healthy basics",
    ingredientsHome:"Ingredients at home",pantryTitle:"Smart pantry",add:"Add",cookFromPantry:"Cook from my pantry",
    pantryAiText:"Generate practical meal ideas using only the ingredients you already have.",
    servings:"Servings",maxTime:"Max time",generateIdeas:"Generate meal ideas",
comparison:"Comparison",compareMeals:"Compare two meals or products",
    compareNow:"Compare now",lifestyle:"Lifestyle",quickProfile:"Quick profile presets",student:"Student",
    office:"Office worker",athlete:"Athlete",busy:"Busy schedule",budgetProfile:"Budget meals",noCook:"No cooking",
    seasonalMode:"Seasonal mode",ramadanMode:"Ramadan planner",iftarTime:"Iftar time",suhoorTime:"Suhoor ends",
    ramadanGoal:"Ramadan goal",generateRamadan:"Create Ramadan guidance",reminders:"Reminders",
    healthyReminders:"Healthy reminders",enable:"Enable",reminderType:"Type",time:"Time",
    addReminder:"Add reminder",installApp:"Install HealthAi",
    installText:"Install the website like an app for a cleaner full-screen experience and offline shell.",
    install:"Install app",weeklyReview:"Weekly review",smartReport:"Smart progress report",
    generateReport:"Generate report",
    smartTools:"Smart Tools",smartToolsText:"Tracker, pantry, comparison and reports",
    mealPlaceholder:"e.g. chicken and rice",pantryPlaceholder:"e.g. eggs, oats, yogurt",
    compareAPlaceholder:"First meal or product",compareBPlaceholder:"Second meal or product",
    emptyMeals:"No meals logged today.",emptyPantry:"Your pantry is empty.",itemRequired:"Enter an item first.",
    mealRequired:"Enter a meal name.",savedMeal:"Meal added to today.",deleted:"Deleted.",
    breakfast:"Breakfast",lunch:"Lunch",dinner:"Dinner",snack:"Snack",
    waterChallenge:"Drink 8 cups",mealChallenge:"Log a meal",planChallenge:"Have a plan",progressChallenge:"Record progress",
    dayStreak:"day streak",
    listening:"Listening… say the meal and calories.",voiceUnsupported:"Voice input is not supported in this browser.",
    presetApplied:"Profile applied. Review your information in the Plan page.",ideasLoading:"Creating ideas...",
    compareLoading:"Comparing...",reportLoading:"Preparing your report...",ramadanLoading:"Preparing Ramadan guidance...",
    notificationGranted:"Notifications enabled.",notificationDenied:"Notification permission was not granted.",
    reminderAdded:"Reminder saved. It works while the app is open.",noReminders:"No reminders yet.",
    installed:"The app is already installed or installation is unavailable.",
    metricMeals:"Meals logged",metricCalories:"Average calories",metricWeight:"Weight entries",metricWater:"Water today",
    noWeeklyData:"Add meals and progress entries to build a richer weekly report.",
    delete:"Delete",kcal:"kcal",grams:"g",unknown:"Unknown",healthScore:"Health score",

  },
  ar:{
    toolsTitle:"الأدوات الذكية",localBadge:"محفوظ محليًا",commandCenter:"مركز التحكم الصحي",
    toolsHeroTitle:"كل ما تحتاجه ليوم صحي في مكان واحد",
    toolsHeroText:"سجّل وجباتك، استخدم مكونات المنزل، قارن اختياراتك، أنشئ تذكيرات وراجع تقدمك الأسبوعي.",
    points:"النقاط",dailyTracker:"المتابعة اليومية",pantry:"المخزن",coach:"المدرب",reports:"التقارير",
    caloriesToday:"سعرات اليوم",proteinToday:"بروتين اليوم",waterToday:"مياه اليوم",
    quickLog:"إضافة سريعة",addMeal:"إضافة وجبة",mealName:"اسم الوجبة",calories:"السعرات",protein:"البروتين",
    mealType:"نوع الوجبة",addToToday:"إضافة لليوم",todayLog:"سجل اليوم",mealsAndMacros:"الوجبات والعناصر",
    clear:"مسح",challenge:"تحدي اليوم",challengeTitle:"أكمل أساسيات يومك الصحي",
    ingredientsHome:"المكونات الموجودة",pantryTitle:"مخزن المكونات الذكي",add:"إضافة",cookFromPantry:"اطبخ من الموجود",
    pantryAiText:"أنشئ أفكار وجبات عملية باستخدام المكونات الموجودة لديك فقط.",
    servings:"عدد الأشخاص",maxTime:"أقصى وقت",generateIdeas:"إنشاء أفكار وجبات",
comparison:"المقارنة",compareMeals:"قارن وجبتين أو منتجين",
    compareNow:"قارن الآن",lifestyle:"نمط الحياة",quickProfile:"قوالب سريعة للملف",student:"طالب",
    office:"موظف مكتب",athlete:"رياضي",busy:"جدول مشغول",budgetProfile:"وجبات اقتصادية",noCook:"بدون طبخ",
    seasonalMode:"وضع موسمي",ramadanMode:"مخطط رمضان",iftarTime:"وقت الإفطار",suhoorTime:"نهاية السحور",
    ramadanGoal:"هدف رمضان",generateRamadan:"إنشاء إرشادات رمضان",reminders:"التذكيرات",
    healthyReminders:"تذكيرات صحية",enable:"تفعيل",reminderType:"النوع",time:"الوقت",
    addReminder:"إضافة تذكير",installApp:"تثبيت HealthAi",
    installText:"ثبّت الموقع كتطبيق للحصول على تجربة شاشة كاملة وواجهة تعمل دون اتصال جزئيًا.",
    install:"تثبيت التطبيق",weeklyReview:"مراجعة أسبوعية",smartReport:"تقرير تقدم ذكي",
    generateReport:"إنشاء التقرير",
    smartTools:"الأدوات الذكية",smartToolsText:"المتابعة والمخزن والمقارنة والتقارير",
    mealPlaceholder:"مثال: فراخ وأرز",pantryPlaceholder:"مثال: بيض، شوفان، زبادي",
    compareAPlaceholder:"الوجبة أو المنتج الأول",compareBPlaceholder:"الوجبة أو المنتج الثاني",
    emptyMeals:"لم تسجل وجبات اليوم.",emptyPantry:"مخزن المكونات فارغ.",itemRequired:"اكتب مكونًا أولًا.",
    mealRequired:"اكتب اسم الوجبة.",savedMeal:"تمت إضافة الوجبة لليوم.",deleted:"تم الحذف.",
    breakfast:"الإفطار",lunch:"الغداء",dinner:"العشاء",snack:"وجبة خفيفة",
    waterChallenge:"اشرب 8 أكواب",mealChallenge:"سجل وجبة",planChallenge:"أنشئ خطة",progressChallenge:"سجل قياسًا",
    dayStreak:"يوم متواصل",
    listening:"أستمع الآن… قل اسم الوجبة والسعرات.",voiceUnsupported:"الإدخال الصوتي غير مدعوم في هذا المتصفح.",
    presetApplied:"تم تطبيق القالب. راجع بياناتك داخل صفحة الخطة.",ideasLoading:"جارٍ إنشاء الأفكار...",
    compareLoading:"جارٍ إجراء المقارنة...",reportLoading:"جارٍ إعداد التقرير...",ramadanLoading:"جارٍ إعداد إرشادات رمضان...",
    notificationGranted:"تم تفعيل الإشعارات.",notificationDenied:"لم يتم منح إذن الإشعارات.",
    reminderAdded:"تم حفظ التذكير. يعمل أثناء فتح التطبيق.",noReminders:"لا توجد تذكيرات.",
    installed:"التطبيق مثبت بالفعل أو التثبيت غير متاح.",
    metricMeals:"الوجبات المسجلة",metricCalories:"متوسط السعرات",metricWeight:"قياسات الوزن",metricWater:"مياه اليوم",
    noWeeklyData:"أضف وجبات وقياسات للحصول على تقرير أسبوعي أغنى.",
    delete:"حذف",kcal:"سعرة",grams:"جم",unknown:"غير معروف",healthScore:"التقييم الصحي",

  }
};

function toolT(key){return TOOL_I18N[currentLanguage]?.[key]||TOOL_I18N.en[key]||key}
function readLocal(key,fallback=[]){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function writeLocal(key,value){localStorage.setItem(key,JSON.stringify(value))}
function todayKey(){return new Date().toISOString().slice(0,10)}

function applyToolsLanguage(){
  document.querySelectorAll("[data-tool-i18n]").forEach(el=>{
    const value=toolT(el.dataset.toolI18n);
    if(value)el.textContent=value;
  });
  document.querySelectorAll("[data-tool-placeholder]").forEach(el=>{
    el.placeholder=toolT(el.dataset.toolPlaceholder);
  });
  const typeLabels={Breakfast:toolT("breakfast"),Lunch:toolT("lunch"),Dinner:toolT("dinner"),Snack:toolT("snack")};
  ["quickMealType"].forEach(id=>{
    const select=document.getElementById(id);
    if(select)[...select.options].forEach(opt=>{if(typeLabels[opt.value])opt.textContent=typeLabels[opt.value]});
  });
  const reminderLabels=currentLanguage==="ar"
    ?{water:"مياه",meal:"وجبة",weight:"قياس الوزن",prep:"تحضير الوجبات"}
    :{water:"Water",meal:"Meal",weight:"Weight",prep:"Meal prep"};
  const reminderSelect=$("#reminderType");
  if(reminderSelect)[...reminderSelect.options].forEach(opt=>opt.textContent=reminderLabels[opt.value]||opt.textContent);
  const ramadanLabels=currentLanguage==="ar"
    ?{maintain:"تثبيت الوزن",loss:"خسارة الدهون",performance:"أداء التمرين"}
    :{maintain:"Maintain",loss:"Fat loss",performance:"Training performance"};
  const ramadanSelect=$("#ramadanGoal");
  if(ramadanSelect)[...ramadanSelect.options].forEach(opt=>opt.textContent=ramadanLabels[opt.value]||opt.textContent);
  if($("#navTools"))$("#navTools").textContent=currentLanguage==="ar"?"الأدوات":"Tools";
  renderDailyTools();renderPantry();renderReminders();renderWeeklyMetrics();renderPoints();
}

const originalApplyLanguage=applyLanguage;
applyLanguage=function(lang){
  originalApplyLanguage(lang);
  applyToolsLanguage();
};

function toolPanelOpen(name){
  document.querySelectorAll(".tool-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.toolPanel===name));
  document.querySelectorAll(".tool-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.toolPanelContent===name));
  localStorage.setItem("healthai_tool_panel",name);
}
document.querySelectorAll(".tool-tab").forEach(btn=>btn.addEventListener("click",()=>toolPanelOpen(btn.dataset.toolPanel)));

function dailyLog(){
  const all=readLocal(TOOL_STORE.daily,{});
  return all[todayKey()]||[];
}
function saveDailyLog(rows){
  const all=readLocal(TOOL_STORE.daily,{});
  all[todayKey()]=rows;
  writeLocal(TOOL_STORE.daily,all);
}
function getNutritionTargets(){
  const u=collectData();
  const calc=calculateNutrition(u);
  return {calories:+calc.calories||2000,protein:+calc.protein||100};
}
function addPoints(amount,reason){
  const data=readLocal(TOOL_STORE.points,{total:0,history:[]});
  data.total=(+data.total||0)+amount;
  data.history.push({date:Date.now(),amount,reason});
  data.history=data.history.slice(-100);
  writeLocal(TOOL_STORE.points,data);
  updateStreak();
  renderPoints();
}
function updateStreak(){
  const data=readLocal(TOOL_STORE.streak,{last:null,count:0});
  const today=todayKey();
  if(data.last===today)return;
  const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
  const y=yesterday.toISOString().slice(0,10);
  data.count=data.last===y?(+data.count||0)+1:1;
  data.last=today;
  writeLocal(TOOL_STORE.streak,data);
}
function renderPoints(){
  const points=readLocal(TOOL_STORE.points,{total:0}).total||0;
  const streak=readLocal(TOOL_STORE.streak,{count:0}).count||0;
  if($("#healthPoints"))$("#healthPoints").textContent=points;
  if($("#healthStreak"))$("#healthStreak").textContent=`${streak} ${toolT("dayStreak")}`;
}
function renderDailyTools(){
  const rows=dailyLog();
  const calories=rows.reduce((sum,row)=>sum+(+row.calories||0),0);
  const protein=rows.reduce((sum,row)=>sum+(+row.protein||0),0);
  const target=getNutritionTargets();
  const water=getWater();

  [["dailyCaloriesValue",calories],["dailyCaloriesTarget",target.calories],["dailyProteinValue",protein],["dailyProteinTarget",target.protein],["dailyWaterValue",water]].forEach(([id,val])=>{if($("#"+id))$("#"+id).textContent=Math.round(val)});
  if($("#dailyCaloriesBar"))$("#dailyCaloriesBar").style.width=Math.min(100,calories/target.calories*100)+"%";
  if($("#dailyProteinBar"))$("#dailyProteinBar").style.width=Math.min(100,protein/target.protein*100)+"%";
  if($("#dailyWaterBar"))$("#dailyWaterBar").style.width=Math.min(100,water/8*100)+"%";

  if($("#todayMealList"))$("#todayMealList").innerHTML=rows.length?rows.map(row=>`
    <div class="compact-item">
      <div><h4>${safe(row.name)}</h4><small>${safe(row.type)} · ${row.calories||0} ${toolT("kcal")} · ${row.protein||0}${toolT("grams")}</small></div>
      <button class="remove-mini" data-remove-daily="${row.id}">${toolT("delete")}</button>
    </div>`).join(""):`<div class="empty-mini">${toolT("emptyMeals")}</div>`;

  const challenges=[
    {icon:"💧",text:toolT("waterChallenge"),done:water>=8},
    {icon:"🍽️",text:toolT("mealChallenge"),done:rows.length>0},
    {icon:"📋",text:toolT("planChallenge"),done:!!currentPlan},
    {icon:"📈",text:toolT("progressChallenge"),done:progressData().some(x=>x.date===todayKey())}
  ];
  const score=challenges.filter(x=>x.done).length;
  if($("#challengeScore"))$("#challengeScore").textContent=`${score}/4`;
  if($("#challengeTitle"))$("#challengeTitle").textContent=toolT("challengeTitle");
  if($("#challengeList"))$("#challengeList").innerHTML=challenges.map(x=>`<div class="challenge-item ${x.done?"done":""}"><span>${x.icon}</span><b>${x.text}</b></div>`).join("");
}

$("#addQuickMealBtn")?.addEventListener("click",()=>{
  const name=$("#quickMealName").value.trim();
  if(!name)return alert(toolT("mealRequired"));
  const rows=dailyLog();
  rows.push({id:String(Date.now()),name,type:$("#quickMealType").value,calories:+$("#quickMealCalories").value||0,protein:+$("#quickMealProtein").value||0});
  saveDailyLog(rows);
  $("#quickMealName").value="";$("#quickMealCalories").value="";$("#quickMealProtein").value="";
  addPoints(5,"meal-log");renderDailyTools();
});
$("#clearTodayLogBtn")?.addEventListener("click",()=>{saveDailyLog([]);renderDailyTools()});
document.addEventListener("click",event=>{
  const btn=event.target.closest("[data-remove-daily]");
  if(btn){saveDailyLog(dailyLog().filter(x=>x.id!==btn.dataset.removeDaily));renderDailyTools()}
});

function pantryData(){return readLocal(TOOL_STORE.pantry,[])}
function renderPantry(){
  const rows=pantryData();
  if($("#pantryCount"))$("#pantryCount").textContent=rows.length;
  if($("#pantryList"))$("#pantryList").innerHTML=rows.length?rows.map((item,index)=>`<span class="pantry-chip">${safe(item)}<button data-remove-pantry="${index}">×</button></span>`).join(""):`<div class="empty-mini">${toolT("emptyPantry")}</div>`;
}
function addPantryItems(){
  const input=$("#pantryItemInput");
  const values=input.value.split(/[,،\n]/).map(x=>x.trim()).filter(Boolean);
  if(!values.length)return alert(toolT("itemRequired"));
  writeLocal(TOOL_STORE.pantry,[...new Set([...pantryData(),...values])]);
  input.value="";addPoints(2,"pantry");renderPantry();
}
$("#addPantryItemBtn")?.addEventListener("click",addPantryItems);
$("#pantryItemInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addPantryItems()}});
document.addEventListener("click",event=>{
  const btn=event.target.closest("[data-remove-pantry]");
  if(btn){const rows=pantryData();rows.splice(+btn.dataset.removePantry,1);writeLocal(TOOL_STORE.pantry,rows);renderPantry()}
});
$("#pantrySuggestBtn")?.addEventListener("click",async()=>{
  const items=pantryData();
  if(!items.length)return alert(toolT("emptyPantry"));
  const box=$("#pantryAiResult");box.hidden=false;box.textContent=toolT("ideasLoading");
  try{
    const prompt=`You are a practical nutrition chef. Language: ${currentLanguage==="ar"?"Arabic":"English"}.
Available ingredients: ${items.join(", ")}.
Servings: ${$("#pantryServings").value}. Maximum preparation time: ${$("#pantryTime").value} minutes.
Suggest 3 realistic meals using mainly these ingredients. For each give name, quantities, steps, estimated calories and protein. Mention only essential missing ingredients. Use clear headings and bullets.`;
    box.textContent=await geminiText(prompt,false);addPoints(8,"pantry-ai");
  }catch(error){box.textContent=error.message}
});

$("#compareMealsBtn")?.addEventListener("click",async()=>{
  const a=$("#compareA").value.trim(),b=$("#compareB").value.trim();
  if(!a||!b)return;
  const box=$("#compareResult");box.hidden=false;box.textContent=toolT("compareLoading");
  try{
    box.textContent=await geminiText(`Compare these two meals or food products for nutrition, protein, calories, satiety, cost and best use case. Respond in ${currentLanguage==="ar"?"Arabic":"English"}. Give a balanced conclusion and do not invent exact values unless provided.
A: ${a}
B: ${b}`,false);addPoints(5,"compare");
  }catch(error){box.textContent=error.message}
});

const PRESETS={
  student:{activity:"1.375",meals:"3",budget:"اقتصادية",likes:"eggs, oats, rice, chicken, yogurt",avoid:"",medical:"Quick portable meals for study days"},
  office:{activity:"1.2",meals:"3",budget:"متوسطة",likes:"salads, chicken, rice, yogurt",avoid:"",medical:"Desk job; prioritize fiber and meal prep"},
  athlete:{activity:"1.725",meals:"5",budget:"مرنة",likes:"chicken, beef, rice, oats, eggs, yogurt",avoid:"",medical:"Training-focused meals and higher protein"},
  busy:{activity:"1.375",meals:"3",budget:"متوسطة",likes:"sandwiches, yogurt, fruit, ready salads",avoid:"",medical:"Meals under 20 minutes"},
  budget:{activity:"1.375",meals:"3",budget:"اقتصادية",likes:"eggs, lentils, beans, rice, oats",avoid:"",medical:"Low-cost ingredients and batch cooking"},
  nocook:{activity:"1.2",meals:"3",budget:"متوسطة",likes:"yogurt, fruit, tuna, bread, cheese",avoid:"",medical:"No-cook meals only"}
};
document.querySelectorAll("[data-preset]").forEach(btn=>btn.addEventListener("click",()=>{
  const p=PRESETS[btn.dataset.preset];if(!p)return;
  Object.entries(p).forEach(([id,value])=>{const el=$("#"+id);if(el){el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}))}});
  $("#presetStatus").textContent=toolT("presetApplied");addPoints(3,"preset");
}));

function ramadanSettings(){return readLocal(TOOL_STORE.ramadan,{enabled:false,iftar:"18:30",suhoor:"04:30",goal:"maintain"})}
function saveRamadan(){
  writeLocal(TOOL_STORE.ramadan,{enabled:$("#ramadanToggle").checked,iftar:$("#iftarTime").value,suhoor:$("#suhoorTime").value,goal:$("#ramadanGoal").value});
}
$("#ramadanToggle")?.addEventListener("change",()=>{$("#ramadanFields").hidden=!$("#ramadanToggle").checked;saveRamadan()});
["iftarTime","suhoorTime","ramadanGoal"].forEach(id=>$("#"+id)?.addEventListener("change",saveRamadan));
$("#generateRamadanBtn")?.addEventListener("click",async()=>{
  const box=$("#ramadanResult");box.hidden=false;box.textContent=toolT("ramadanLoading");
  const s=ramadanSettings(),u=collectData(),c=calculateNutrition(u);
  try{
    box.textContent=await geminiText(`Create safe, practical Ramadan nutrition guidance in ${currentLanguage==="ar"?"Arabic":"English"}.
User goal: ${s.goal}. Iftar: ${s.iftar}. Suhoor ends: ${s.suhoor}.
Daily target: ${c.calories} calories and ${c.protein}g protein.
Include hydration distribution, iftar, snack, suhoor, caffeine, training timing, and a warning for medical conditions.`,false);addPoints(8,"ramadan");
  }catch(error){box.textContent=error.message}
});

function reminderData(){return readLocal(TOOL_STORE.reminders,[])}
function renderReminders(){
  const rows=reminderData();
  if($("#reminderList"))$("#reminderList").innerHTML=rows.length?rows.map(row=>`<div class="compact-item"><div><h4>${safe(row.label)}</h4><small>${row.time}</small></div><button class="remove-mini" data-remove-reminder="${row.id}">${toolT("delete")}</button></div>`).join(""):`<div class="empty-mini">${toolT("noReminders")}</div>`;
}
$("#enableNotificationsBtn")?.addEventListener("click",async()=>{
  if(!("Notification" in window))return alert(toolT("notificationDenied"));
  const p=await Notification.requestPermission();
  alert(p==="granted"?toolT("notificationGranted"):toolT("notificationDenied"));
});
$("#addReminderBtn")?.addEventListener("click",()=>{
  const type=$("#reminderType").value,time=$("#reminderTime").value;
  const label=$("#reminderType").selectedOptions[0].textContent;
  const rows=reminderData();rows.push({id:String(Date.now()),type,time,label,lastShown:null});writeLocal(TOOL_STORE.reminders,rows);
  renderReminders();addPoints(2,"reminder");$("#installStatus").textContent=toolT("reminderAdded");
});
document.addEventListener("click",event=>{
  const btn=event.target.closest("[data-remove-reminder]");
  if(btn){writeLocal(TOOL_STORE.reminders,reminderData().filter(x=>x.id!==btn.dataset.removeReminder));renderReminders()}
});
setInterval(()=>{
  const now=new Date(),hhmm=now.toTimeString().slice(0,5),today=todayKey();
  const rows=reminderData();let changed=false;
},60000);

setInterval(()=>{
  if(Notification?.permission!=="granted")return;
  const now=new Date(),hhmm=now.toTimeString().slice(0,5),today=todayKey();
  const rows=reminderData();let changed=false;
  rows.forEach(row=>{
    if(row.time===hhmm&&row.lastShown!==today){
      new Notification("HealthAi",{body:row.label,icon:"/icon.svg"});
      row.lastShown=today;changed=true;
    }
  });
  if(changed)writeLocal(TOOL_STORE.reminders,rows);
},30000);

let deferredInstallPrompt=null;
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;$("#installStatus").textContent=""});
$("#installAppBtn")?.addEventListener("click",async()=>{
  if(!deferredInstallPrompt){$("#installStatus").textContent=toolT("installed");return}
  deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;
});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(console.warn));

function weeklyStats(){
  const all=readLocal(TOOL_STORE.daily,{});
  const dates=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return d.toISOString().slice(0,10)});
  const meals=dates.flatMap(date=>all[date]||[]);
  const caloriesByDay=dates.map(date=>(all[date]||[]).reduce((s,x)=>s+(+x.calories||0),0)).filter(x=>x>0);
  const progress=progressData().filter(x=>dates.includes(x.date));
  return{
    meals:meals.length,
    avgCalories:caloriesByDay.length?Math.round(caloriesByDay.reduce((a,b)=>a+b,0)/caloriesByDay.length):0,
    weightEntries:progress.length,
    water:getWater(),
    progress
  };
}
function renderWeeklyMetrics(){
  const s=weeklyStats();
  if($("#weeklyReportMetrics"))$("#weeklyReportMetrics").innerHTML=[
    [toolT("metricMeals"),s.meals],[toolT("metricCalories"),s.avgCalories||"—"],[toolT("metricWeight"),s.weightEntries],[toolT("metricWater"),`${s.water}/8`]
  ].map(([label,value])=>`<div class="report-metric"><small>${label}</small><b>${value}</b></div>`).join("");
}
$("#generateWeeklyReportBtn")?.addEventListener("click",async()=>{
  const s=weeklyStats(),box=$("#weeklyReportResult");box.hidden=false;box.textContent=toolT("reportLoading");
  try{
    box.textContent=await geminiText(`Write a concise weekly nutrition progress report in ${currentLanguage==="ar"?"Arabic":"English"}.
Meals logged: ${s.meals}; average logged calories: ${s.avgCalories}; weight entries: ${JSON.stringify(s.progress)}; water today: ${s.water}/8.
Give wins, gaps, three practical next-week actions, and a gentle disclaimer. ${s.meals+s.weightEntries===0?toolT("noWeeklyData"):""}`,false);addPoints(10,"weekly-report");
  }catch(error){box.textContent=error.message}
});



function initSmartTools(){
  toolPanelOpen(localStorage.getItem("healthai_tool_panel")||"daily");
  const r=ramadanSettings();
  if($("#ramadanToggle"))$("#ramadanToggle").checked=!!r.enabled;
  if($("#ramadanFields"))$("#ramadanFields").hidden=!r.enabled;
  if($("#iftarTime"))$("#iftarTime").value=r.iftar||"18:30";
  if($("#suhoorTime"))$("#suhoorTime").value=r.suhoor||"04:30";
  if($("#ramadanGoal"))$("#ramadanGoal").value=r.goal||"maintain";
  applyToolsLanguage();
}


(function init(){
  try{
    loadUser();
    updateLocalCalc();

    const today=new Date().toISOString().slice(0,10);
    if($("#progressDate"))$("#progressDate").value=today;
    if($("#mealDiaryDate"))$("#mealDiaryDate").value=today;

    const savedPlan=JSON.parse(localStorage.getItem(STORE.plan)||"null");
    if(savedPlan){currentPlan=savedPlan;renderPlan(savedPlan)}

    applyLanguage(localStorage.getItem(STORE.language)||"en");
    initSmartTools();
    renderMealDiary();
    renderProgress();
    updateCommitment();
    openPage(localStorage.getItem("healthai_active_page")||"page-home");
  }catch(error){
    console.error("HealthAi init error:",error);
    showError(error);
  }
})();

window.addEventListener("storage",()=>{try{renderDailyTools();renderWeeklyMetrics()}catch{}});
