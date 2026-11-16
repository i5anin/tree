/** Находит элемент интерфейса по его ID для обработчиков приложения. */
const $ = (id) => document.getElementById(id);
const palette = [ ['#2c71c7','#edf4ff'], ['#208573','#eaf7f1'], ['#9c6ac2','#f5effa'], ['#c17b27','#fff5e6'], ['#bd5d7d','#fff0f5'] ];
const demo = {name:'Орбита',description:'Пример структуры цифрового продукта: от направлений работы до отдельных компонентов.',children:[
 {name:'Продукт',description:'Всё, что помогает создавать полезный пользовательский опыт.',children:[{name:'Исследования',description:'Интервью, гипотезы и проверка потребностей.',children:[{name:'Интервью',value:12},{name:'Гипотезы',value:8}]},{name:'Дизайн',description:'Визуальная система и сценарии взаимодействия.',children:[{name:'Компоненты',value:42},{name:'Прототипы',value:6}]}]},
 {name:'Разработка',description:'Системы и инструменты, на которых работает продукт.',children:[{name:'Интерфейс',children:[{name:'Веб-приложение'},{name:'Мобильная версия'}]},{name:'Сервер',children:[{name:'API'},{name:'База данных'}]}]},
 {name:'Команда',description:'Люди и процессы, которые соединяют идею с результатом.',children:[{name:'Участники',value:16},{name:'Процессы',children:[{name:'Планирование'},{name:'Обратная связь'}]}]}
]};
let tree, nodes=[], selected, collapsed=new Set(), query='', zoom=1, size={width:1,height:1}, toastTimer;
/** Создаёт безопасный HTML-элемент для панелей; текст из JSON не интерпретируется как разметка. */
function element(tag, className, text) {
 const item=document.createElement(tag); if(className) item.className=className; if(text!==undefined) item.textContent=String(text); return item;
}
/** Создаёт SVG-элемент для render; атрибуты задаются программой, подписи — через textContent. */
function svgElement(tag, attributes, text) {
 const item=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [key,value] of Object.entries(attributes)) item.setAttribute(key,value);
 if(text!==undefined) item.textContent=String(text); return item;
}
/** Проверяет вход редактора перед заменой дерева. Ограничивает размер и глубину, генерирует внутренние ID и связи с родителями. */
function normalize(data) {
 let list=[];
 /** Обходит один узел JSON; сохраняет только поддерживаемые поля и отклоняет некорректную структуру. */
 function visit(raw,parent,depth,branch) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw Error('Каждый узел должен быть объектом.');
  if(typeof raw.name!=='string' || !raw.name.trim() || raw.name.length>120) throw Error('Поле name: непустая строка длиной до 120 символов.');
  if(depth>19) throw Error('Допустимо не более 20 уровней.');
  if(list.length>=500) throw Error('Допустимо не более 500 узлов.');
  if(raw.children!==undefined && !Array.isArray(raw.children)) throw Error('Поле children должно быть массивом.');
  if(raw.description!==undefined && (typeof raw.description!=='string' || raw.description.length>2000)) throw Error('description: строка длиной до 2000 символов.');
  if(raw.value!==undefined && !(typeof raw.value==='string' && raw.value.length<=500) && !(typeof raw.value==='number' && Number.isFinite(raw.value)) && typeof raw.value!=='boolean' && raw.value!==null) throw Error('value: строка до 500 символов, конечное число, boolean или null.');
  const node={id:list.length,name:raw.name.trim(),description:raw.description||'',value:raw.value,parent,depth,branch,children:[]}; list.push(node);
  node.children=(raw.children||[]).map((child,index)=>visit(child,node,depth+1,depth===0?index:branch));
  return node;
 }
 const root=visit(data,null,0,0); return {root,list};
}
/** Устанавливает проверенные данные из примера или редактора и сбрасывает состояние поиска и сворачивания. */
function load(data) {
 const result=normalize(data); tree=result.root; nodes=result.list; selected=tree; collapsed.clear(); query=''; $('search').value=''; render(); details(); requestAnimationFrame(fit);
}
/** Возвращает переносимый JSON без служебных ID, координат и обратных ссылок; используется редактором и экспортом. */
function serialize(node) {
 const data={name:node.name}; if(node.description) data.description=node.description; if(node.value!==undefined) data.value=node.value;
 if(node.children.length) data.children=node.children.map(serialize); return data;
}
/** Подсчитывает всех потомков узла для панели сведений, независимо от свёрнутых ветвей. */
function descendants(node) { return node.children.reduce((count,child)=>count+1+descendants(child),0); }
/** Выбирает узел карты или панели; перерисовывает выделение и подробности без изменения данных. */
function select(node) { selected=node; render(); details(); }
/** Строит горизонтальное дерево. Листья занимают отдельные строки, родитель располагается посередине крайних детей.
 * Поиск временно раскрывает предков совпадений; пользовательское состояние сворачивания сохраняется. */
function render() {
 const matches=new Set(nodes.filter(n=>query && n.name.toLocaleLowerCase('ru').includes(query)).map(n=>n.id));
 const ancestors=new Set();
 for(const node of nodes) if(matches.has(node.id)) { let parent=node.parent; while(parent){ancestors.add(parent.id);parent=parent.parent;} }
 let row=0, visible=[];
 /** Вычисляет координаты видимой части дерева; используется только текущим проходом render. */
 function layout(node) {
  visible.push(node); node.x=36+node.depth*268;
  const open=node.children.length && (!collapsed.has(node.id)||ancestors.has(node.id));
  if(open){node.children.forEach(layout);node.y=(node.children[0].y+node.children.at(-1).y)/2;}else{node.y=30+row*94;row++;}
 }
 layout(tree); size={width:Math.max(...visible.map(n=>n.x))+255,height:Math.max(200,row*94+40)};
 const map=$('map'); map.replaceChildren();
 for(const node of visible) {
  const color=palette[node.branch%palette.length][0];
  if(node.parent) map.append(svgElement('path',{class:'link',stroke:color,d:'M '+(node.parent.x+210)+' '+(node.parent.y+30)+' C '+(node.x-30)+' '+(node.parent.y+30)+', '+(node.x-35)+' '+(node.y+30)+', '+node.x+' '+(node.y+30)}));
 }
 for(const node of visible) {
  const [color,tint]=palette[node.branch%palette.length];
  const group=svgElement('g',{class:'node'+(node===selected?' selected':'')+(matches.has(node.id)?' match':''),transform:'translate('+node.x+','+node.y+')',tabindex:'0',role:'button','aria-label':node.name+', уровень '+(node.depth+1),'aria-pressed':String(node===selected),style:'--branch:'+color+';--tint:'+tint});
  group.append(svgElement('title',{},node.name),svgElement('rect',{class:'node-card',width:210,height:60,rx:10}),svgElement('rect',{x:0,y:16,width:3,height:28,rx:1.5,fill:color}),svgElement('text',{x:17,y:25,class:'node-title'},node.name.length>22?node.name.slice(0,21)+'…':node.name),svgElement('text',{x:17,y:44,class:'node-meta'},node.children.length?node.children.length+' дочерних узла':node.value!==undefined?'Значение: '+String(node.value).slice(0,23):'Конечный узел'));
  group.addEventListener('click',()=>select(node));
  group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(node);}});
  map.append(group);
  if(node.children.length){
   const open=!collapsed.has(node.id)||ancestors.has(node.id);
   const toggle=svgElement('g',{class:'toggle',transform:'translate('+(node.x+226)+','+(node.y+30)+')',tabindex:'0',role:'button','aria-label':(open?'Свернуть ':'Раскрыть ')+node.name,'aria-expanded':String(open),style:'--branch:'+color});
   toggle.append(svgElement('circle',{r:10}),svgElement('text',{y:5},open?'−':'+'));
   /** Переключает ветвь; при активном поиске очищает запрос, чтобы сворачивание давало видимый результат. */
   const toggleBranch=()=>{query='';$('search').value='';if(open)collapsed.add(node.id);else collapsed.delete(node.id);render();};
   toggle.addEventListener('click',toggleBranch);toggle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleBranch();}});map.append(toggle);
  }
 }
 $('total').textContent=nodes.length;$('visible').textContent='Показано '+visible.length+' из '+nodes.length;
 $('results').textContent=query?'Найдено: '+matches.size:''; applyZoom();
}
/** Заполняет панель выбранного узла безопасными текстовыми элементами и кнопками перехода к детям. */
function details() {
 const panel=$('details'),node=selected; panel.replaceChildren(); const [color,tint]=palette[node.branch%palette.length];panel.style.setProperty('--branch',color);panel.style.setProperty('--tint',tint);
 panel.append(element('div','node-mark',node.children.length?'⑂':'◇'),element('h2','',node.name),element('span','badge',node.parent?'Уровень '+(node.depth+1):'Корневой узел'),element('p','description',node.description||'Описание не задано.'));
 if(node.value!==undefined){panel.append(element('p','detail-label','Значение'),element('p','description',String(node.value)));}
 const stats=element('div','stats');for(const [value,label] of [[node.children.length,'Прямых потомков'],[descendants(node),'Всего потомков']]){const item=element('div');item.append(element('strong','',value),element('span','',label));stats.append(item);}panel.append(stats);
 let path=[],cursor=node;while(cursor){path.unshift(cursor.name);cursor=cursor.parent;}panel.append(element('p','detail-label','Путь в структуре'),element('p','breadcrumb',path.join(' / ')));
 if(node.children.length){panel.append(element('p','detail-label','Дочерние элементы'));const list=element('div','child-list');for(const child of node.children){const button=element('button','',child.name);button.addEventListener('click',()=>reveal(child));list.append(button);}panel.append(list);}
 if(node.parent){const back=element('button','','К родительскому узлу');back.style.marginTop='18px';back.addEventListener('click',()=>reveal(node.parent));panel.append(back);}
}
/** Делает выбранный из панели узел видимым: раскрывает предков и прокручивает карту к его координатам. */
function reveal(node) {
 let parent=node.parent;while(parent){collapsed.delete(parent.id);parent=parent.parent;}select(node);
 $('viewport').scrollTo({left:Math.max(0,node.x*zoom-$('viewport').clientWidth/2+105*zoom),top:Math.max(0,node.y*zoom-$('viewport').clientHeight/2+30*zoom)});
}
/** Применяет масштаб к SVG без изменения геометрии дерева; вызывается после render и кнопок масштаба. */
function applyZoom() { $('map').setAttribute('viewBox','0 0 '+size.width+' '+size.height);$('map').setAttribute('width',size.width*zoom);$('map').setAttribute('height',size.height*zoom);$('scale').textContent=Math.round(zoom*100)+'%'; }
/** Подбирает масштаб по текущей видимой структуре с нижним пределом для читаемости крупных деревьев. */
function fit() { zoom=Math.max(.25,Math.min(1,($('viewport').clientWidth-40)/size.width,($('viewport').clientHeight-105)/size.height));applyZoom();$('viewport').scrollTo({left:0,top:0}); }
/** Показывает краткий результат скачивания или загрузки в области статуса. */
function notify(message) { clearTimeout(toastTimer);$('toast').textContent=message;$('toast').style.display='block';toastTimer=setTimeout(()=>{$('toast').style.display='none';},3200); }
/** Открывает редактор с текущими данными; отмена не меняет дерево. */
function openEditor() { $('json').value=JSON.stringify(serialize(tree),null,2);$('error').textContent='';$('file').value='';$('editor').showModal(); }
/** Считывает локальный файл редактора; ограничение до чтения защищает от слишком больших входных данных. */
async function readFile(event) {
 const file=event.target.files[0];if(!file)return;
 try{if(file.size>1_000_000)throw Error('Файл превышает 1 МБ.');$('json').value=await file.text();$('error').textContent='';}catch(error){$('error').textContent=error.message;}
}
/** Проверяет JSON и применяет его атомарно: ошибки оставляют текущую карту без изменений. */
function submitData(event) { event.preventDefault();try{const text=$('json').value;if(text.length>1_000_000)throw Error('JSON превышает 1 МБ.');let data;try{data=JSON.parse(text);}catch{throw Error('Некорректный JSON. Проверьте кавычки, запятые и скобки.');}load(data);$('editor').close();notify('Дерево построено');}catch(error){$('error').textContent=error.message;} }
/** Скачивает переносимый JSON текущей структуры средствами браузера, без передачи данных на сервер. */
function exportData() { const url=URL.createObjectURL(new Blob([JSON.stringify(serialize(tree),null,2)],{type:'application/json'}));const link=element('a');link.href=url;link.download='hierarchy.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('JSON подготовлен к скачиванию'); }
$('search').addEventListener('input',event=>{query=event.target.value.trim().toLocaleLowerCase('ru');render();});
$('expand').addEventListener('click',()=>{collapsed.clear();render();fit();});
$('collapse').addEventListener('click',()=>{query='';$('search').value='';collapsed=new Set(nodes.filter(n=>n.depth>0&&n.children.length).map(n=>n.id));render();fit();});
$('plus').addEventListener('click',()=>{zoom=Math.min(2,zoom+.15);applyZoom();});
$('minus').addEventListener('click',()=>{zoom=Math.max(.25,zoom-.15);applyZoom();});
$('fit').addEventListener('click',fit);$('import').addEventListener('click',openEditor);$('close').addEventListener('click',()=>$('editor').close());
$('file').addEventListener('change',readFile);$('data-form').addEventListener('submit',submitData);$('export').addEventListener('click',exportData);$('demo').addEventListener('click',()=>load(demo));
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('editor').open){event.preventDefault();$('search').focus();}});
load(demo);
