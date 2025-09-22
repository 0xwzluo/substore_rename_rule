/**
 * Sub-Store rename_self.js — hardened (no host/port fallback)
 * 重点增强
 * 1) 执行顺序：先【归一化→地区识别→重命名】，最后才【清理/过滤】；
 * 2) 防御式写法：入参与匹配均字符串化，空值/空串过滤，动态正则转义；
 * 3) “深/沪/呼/京/广/杭 + 港”硬锁为【香港】（仍保留，但无任何机场域名/端口兜底）；
 * 4) 新增 wlkey（白名单），命中则绕过清理；
 * 5) 删除所有与特定机场相关的“域名/端口兜底识别”逻辑。
 *
 * 兼容参数：
 * - abs=en|all|off  两字母国家码边界（默认 en）
 * - fgf/sn/name/blkey/wlkey/blockquic/in/out
 * - clear/nx/bl/blgd/blpx/blnx/one/debug/flag/nm/nf
 */

const inArg = $arguments || {};

// ---------- 参数解析 ----------
function boolArg(v, d = false) {
  if (v === undefined || v === null) return d;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return d;
    if (/^(true|1|on|yes)$/i.test(s)) return true;
    if (/^(false|0|off|no)$/i.test(s)) return false;
    return d;
  }
  return !!v;
}
function strArg(v, d = "") {
  if (v === undefined || v === null) return d;
  const s = String(v);
  return s.length ? s : d;
}

const nx = boolArg(inArg.nx, false);
const bl = boolArg(inArg.bl, false);
const nf = boolArg(inArg.nf, false);
const key = boolArg(inArg.key, false);
const blgd = boolArg(inArg.blgd, false);
const blpx = boolArg(inArg.blpx, false);
const blnx = boolArg(inArg.blnx, false);
const numone = boolArg(inArg.one, false);
const debug = boolArg(inArg.debug, false);
const clear = boolArg(inArg.clear, true);     // 默认清理开启
const addflag = boolArg(inArg.flag, false);
const nm = boolArg(inArg.nm, false);

const ABSMODE = strArg(inArg.abs, "en").toLowerCase();

const FGF   = decodeURI(strArg(inArg.fgf, " "));
const XHFGF = decodeURI(strArg(inArg.sn,  " "));
const FNAME = decodeURI(strArg(inArg.name, ""));
const BLKEY = decodeURI(strArg(inArg.blkey, ""));
const WLKEY = decodeURI(strArg(inArg.wlkey, "")); // 白名单
const blockquic = decodeURI(strArg(inArg.blockquic, ""));

const nameMap = { cn: "cn", zh: "cn", us: "us", en: "us", quan: "quan", gq: "gq", flag: "gq" };
const inname = nameMap[strArg(inArg.in, "")] || "";
const outputName = nameMap[strArg(inArg.out, "")] || "";

// ---------- 数据表（与原版等价） ----------
const FG=['🇭🇰','🇲🇴','🇹🇼','🇯🇵','🇰🇷','🇸🇬','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇦🇺','🇦🇪','🇦🇫','🇦🇱','🇩🇿','🇦🇴','🇦🇷','🇦🇲','🇦🇹','🇦🇿','🇧🇭','🇧🇩','🇧🇾','🇧🇪','🇧🇿','🇧🇯','🇧🇹','🇧🇴','🇧🇦','🇧🇼','🇧🇷','🇻🇬','🇧🇳','🇧🇬','🇧🇫','🇧🇮','🇰🇭','🇨🇲','🇨🇦','🇨🇻','🇰🇾','🇨🇫','🇹🇩','🇨🇱','🇨🇴','🇰🇲','🇨🇬','🇨🇩','🇨🇷','🇭🇷','🇨🇾','🇨🇿','🇩🇰','🇩🇯','🇩🇴','🇪🇨','🇪🇬','🇸🇻','🇬🇶','🇪🇷','🇪🇪','🇪🇹','🇫🇯','🇫🇮','🇬🇦','🇬🇲','🇬🇪','🇬🇭','🇬🇷','🇬🇱','🇬🇹','🇬🇳','🇬🇾','🇭🇹','🇭🇳','🇭🇺','🇮🇸','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇪','🇮🇲','🇮🇱','🇮🇹','🇨🇮','🇯🇲','🇯🇴','🇰🇿','🇰🇪','🇰🇼','🇰🇬','🇱🇦','🇱🇻','🇱🇧','🇱🇸','🇱🇷','🇱🇾','🇱🇹','🇱🇺','🇲🇰','🇲🇬','🇲🇼','🇲🇾','🇲🇻','🇲🇱','🇲🇹','🇲🇷','🇲🇺','🇲🇽','🇲🇩','🇲🇨','🇲🇳','🇲🇪','🇲🇦','🇲🇿','🇲🇲','🇳🇦','🇳🇵','🇳🇱','🇳🇿','🇳🇮','🇳🇪','🇳🇬','🇰🇵','🇳🇴','🇴🇲','🇵🇰','🇵🇦','🇵🇾','🇵🇪','🇵🇭','🇵🇹','🇵🇷','🇶🇦','🇷🇴','🇷🇺','🇷🇼','🇸🇲','🇸🇦','🇸🇳','🇷🇸','🇸🇱','🇸🇰','🇸🇮','🇸🇴','🇿🇦','🇪🇸','🇱🇰','🇸🇩','🇸🇷','🇸🇿','🇸🇪','🇨🇭','🇸🇾','🇹🇯','🇹🇿','🇹🇭','🇹🇬','🇹🇴','🇹🇹','🇹🇳','🇹🇷','🇹🇲','🇻🇮','🇺🇬','🇺🇦','🇺🇾','🇺🇿','🇻🇪','🇻🇳','🇾🇪','🇿🇲','🇿🇼','🇦🇩','🇷🇪','🇵🇱','🇬🇺','🇻🇦','🇱🇮','🇨🇼','🇸🇨','🇦🇶','🇬🇮','🇨🇺','🇫🇴','🇦🇽','🇧🇲','🇹🇱'];
const EN=['HK','MO','TW','JP','KR','SG','US','GB','FR','DE','AU','AE','AF','AL','DZ','AO','AR','AM','AT','AZ','BH','BD','BY','BE','BZ','BJ','BT','BO','BA','BW','BR','VG','BN','BG','BF','BI','KH','CM','CA','CV','KY','CF','TD','CL','CO','KM','CG','CD','CR','HR','CY','CZ','DK','DJ','DO','EC','EG','SV','GQ','ER','EE','ET','FJ','FI','GA','GM','GE','GH','GR','GL','GT','GN','GY','HT','HN','HU','IS','IN','ID','IR','IQ','IE','IM','IL','IT','CI','JM','JO','KZ','KE','KW','KG','LA','LV','LB','LS','LR','LY','LT','LU','MK','MG','MW','MY','MV','ML','MT','MR','MU','MX','MD','MC','MN','ME','MA','MZ','MM','NA','NP','NL','NZ','NI','NE','NG','KP','NO','OM','PK','PA','PY','PE','PH','PT','PR','QA','RO','RU','RW','SM','SA','SN','RS','SL','SK','SI','SO','ZA','ES','LK','SD','SR','SZ','SE','CH','SY','TJ','TZ','TH','TG','TO','TT','TN','TR','TM','VI','UG','UA','UY','UZ','VE','VN','YE','ZM','ZW','AD','RE','PL','GU','VA','LI','CW','SC','AQ','GI','CU','FO','AX','BM','TL'];
const ZH=['香港','澳门','台湾','日本','韩国','新加坡','美国','英国','法国','德国','澳大利亚','阿联酋','阿富汗','阿尔巴尼亚','阿尔及利亚','安哥拉','阿根廷','亚美尼亚','奥地利','阿塞拜疆','巴林','孟加拉国','白俄罗斯','比利时','伯利兹','贝宁','不丹','玻利维亚','波斯尼亚和黑塞哥维那','博茨瓦纳','巴西','英属维京群岛','文莱','保加利亚','布基纳法索','布隆迪','柬埔寨','喀麦隆','加拿大','佛得角','开曼群岛','中非共和国','乍得','智利','哥伦比亚','科摩罗','刚果(布)','刚果(金)','哥斯达黎加','克罗地亚','塞浦路斯','捷克','丹麦','吉布提','多米尼加共和国','厄瓜多尔','埃及','萨尔瓦多','赤道几内亚','厄立特里亚','爱沙尼亚','埃塞俄比亚','斐济','芬兰','加蓬','冈比亚','格鲁吉亚','加纳','希腊','格陵兰','危地马拉','几内亚','圭亚那','海地','洪都拉斯','匈牙利','冰岛','印度','印尼','伊朗','伊拉克','爱尔兰','马恩岛','以色列','意大利','科特迪瓦','牙买加','约旦','哈萨克斯坦','肯尼亚','科威特','吉尔吉斯斯坦','老挝','拉脱维亚','黎巴嫩','莱索托','利比里亚','利比亚','立陶宛','卢森堡','马其顿','马达加斯加','马拉维','马来','马尔代夫','马里','马耳他','毛利塔尼亚','毛里求斯','墨西哥','摩尔多瓦','摩纳哥','蒙古','黑山共和国','摩洛哥','莫桑比克','缅甸','纳米比亚','尼泊尔','荷兰','新西兰','尼加拉瓜','尼日尔','尼日利亚','朝鲜','挪威','阿曼','巴基斯坦','巴拿马','巴拉圭','秘鲁','菲律宾','葡萄牙','波多黎各','卡塔尔','罗马尼亚','俄罗斯','卢旺达','圣马力诺','沙特阿拉伯','塞内加尔','塞尔维亚','塞拉利昂','斯洛伐克','斯洛文尼亚','索马里','南非','西班牙','斯里兰卡','苏丹','苏里南','斯威士兰','瑞典','瑞士','叙利亚','塔吉克斯坦','坦桑尼亚','泰国','多哥','汤加','特立尼达和多巴哥','突尼斯','土耳其','土库曼斯坦','美属维尔京群岛','乌干达','乌克兰','乌拉圭','乌兹别克斯坦','委内瑞拉','越南','也门','赞比亚','津巴布韦','安道尔','留尼汪','波兰','关岛','梵蒂冈','列支敦士登','库拉索','塞舌尔','南极','直布罗陀','古巴','法罗群岛','奥兰群岛','百慕达','东帝汶'];
const QC=['Hong Kong','Macao','Taiwan','Japan','Korea','Singapore','United States','United Kingdom','France','Germany','Australia','Dubai','Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Austria','Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','British Virgin Islands','Brunei','Bulgaria','Burkina-faso','Burundi','Cambodia','Cameroon','Canada','CapeVerde','CaymanIslands','Central African Republic','Chad','Chile','Colombia','Comoros','Congo-Brazzaville','Congo-Kinshasa','CostaRica','Croatia','Cyprus','Czech Republic','Denmark','Djibouti','Dominican Republic','Ecuador','Egypt','EISalvador','Equatorial Guinea','Eritrea','Estonia','Ethiopia','Fiji','Finland','Gabon','Gambia','Georgia','Ghana','Greece','Greenland','Guatemala','Guinea','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Isle of Man','Israel','Italy','Ivory Coast','Jamaica','Jordan','Kazakstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Lithuania','Luxembourg','Macedonia','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar(Burma)','Namibia','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','NorthKorea','Norway','Oman','Pakistan','Panama','Paraguay','Peru','Philippines','Portugal','PuertoRico','Qatar','Romania','Russia','Rwanda','SanMarino','SaudiArabia','Senegal','Serbia','SierraLeone','Slovakia','Slovenia','Somalia','SouthAfrica','Spain','SriLanka','Sudan','Suriname','Swaziland','Sweden','Switzerland','Syria','Tajikstan','Tanzania','Thailand','Togo','Tonga','TrinidadandTobago','Tunisia','Turkey','Turkmenistan','U.S.Virgin Islands','Uganda','Ukraine','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe','Andorra','Reunion','Poland','Guam','Vatican','Liechtensteins','Curacao','Seychelles','Antarctica','Gibraltar','Cuba','Faroe Islands','Ahvenanmaa','Bermuda','Timor-Leste'];

// ---------- 识别/清理配置 ----------
const specialRegex = [/(\d\.)?\d+×/,/IPLC|IEPL|Kern|Edge|Pro|Std|Exp|Biz|Fam|Game|Buy|Zx|LB|Game/];
const nameclear = /(套餐|到期|有效|剩余|版本|已用|过期|失联|测试|官方|网址|备用|群|TEST|客服|网站|获取|订阅|流量|机场|下次|官址|联系|邮箱|工单|学术|USE|USED|TOTAL|EXPIRE|EMAIL)/i;

const regexArray=[/ˣ²/,/ˣ³/,/ˣ⁴/,/ˣ⁵/,/ˣ⁶/,/ˣ⁷/,/ˣ⁸/,/ˣ⁹/,/ˣ¹⁰/,/ˣ²⁰/,/ˣ³⁰/,/ˣ⁴⁰/,/ˣ⁵⁰/,/专线/,(IPLC|I-P-L-C)/i,(IEPL|I-E-P-L)/i,/核心/,/边缘/,/高级/,/标准/,/特殊/,/实验/,/商宽/,/家宽/,/家庭宽带/,/游戏|game/i,/购物/,/LB/,/cloudflare/i,/\budp\b/i,/\bgpt\b/i,/udpn\b/];
const valueArray=["2×","3×","4×","5×","6×","7×","8×","9×","10×","20×","30×","40×","50×","DL","IPLC","IEPL","Kern","Edge","Pro","Std","Spec","Exp","Biz","Fam","Game","Buy","LB","CF","UDP","GPT","UDPN"];

const nameblnx = /(高倍|(?!1)2+(x|倍)|ˣ²|ˣ³|ˣ⁴|ˣ⁵|ˣ¹⁰)/i;
const namenx = /(高倍|(?!1)(0\.|\d)+(x|倍)|ˣ²|ˣ³|ˣ⁴|ˣ⁵|ˣ¹⁰)/i;

const keya = /港|Hong|HK|新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR/i;
const keyb = /(((1|2|3|4)\d)|(香港|Hong|HK) 0[5-9]|((新加坡|SG|Singapore|日本|Japan|JP|美国|United States|US|韩|土耳其|TR|Turkey|Korea|KR) 0[3-9]))/i;

// ---------- 工具 ----------
const EN_SET = new Set(EN);
function escapeReg(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function isAsciiWord(s){return /^[A-Za-z0-9]+$/.test(String(s));}
function matchWithBoundary(name, key){
  const src = String(name||"");
  const k   = String(key||"");
  if (!k) return false;
  if (ABSMODE === "off") return src.includes(k);
  if (ABSMODE === "en" && EN_SET.has(k)){
    const re = new RegExp(`(?:^|[^A-Za-z])${escapeReg(k)}(?:[^A-Za-z]|$)`,"i");
    return re.test(src);
  }
  const ascii = isAsciiWord(k);
  const re = ascii
    ? new RegExp(`(?:^|[^A-Za-z0-9])${escapeReg(k)}(?:[^A-Za-z0-9]|$)`,"i")
    : new RegExp(`(?:^|[^\\u4e00-\\u9fffA-Za-z0-9])${escapeReg(k)}(?:[^\\u4e00-\\u9fffA-Za-z0-9]|$)`,"i");
  return re.test(src);
}

// ---------- 归一化替换表（不引入新键） ----------
const rurekey = {
  GB: /UK/g,
  "B-G-P": /BGP/g,
  "I-E-P-L": /IEPL/gi,
  "I-P-L-C": /IPLC/gi,
  "Russia Moscow": /Moscow/g,
  "Korea Chuncheon": /Chuncheon|Seoul/g,
  "Hong Kong": /Hongkong|HONG KONG/gi,
  "United Kingdom London": /London|Great Britain/g,

  "Taiwan TW 台湾 ": /(台|Tai\s?wan|TW).*?|.*?(台|Tai\s?wan|TW)/g,
  "United States": /USA|Los Angeles|San Jose|Silicon Valley|Michigan/g,
  澳大利亚: /澳洲|墨尔本|悉尼|土澳|(深|沪|呼|京|广|杭)澳/g,
  德国: /(深|沪|呼|京|广|杭)德|法兰克福|滬德/g,
  香港: /(深|沪|呼|京|广|杭)港/g,          // 香港硬锁（基于名字）
  台湾: /新台|新北|台(?!.*线)/g,
  Taiwan: /Taipei/g,
  日本: /(深|沪|呼|京|广|杭|中|辽)日|东京|大坂/g,
  新加坡: /狮城|(深|沪|呼|京|广|杭)新/g,
  美国: /(深|沪|呼|京|广|杭)美|波特兰|芝加哥|哥伦布|纽约|硅谷|俄勒冈|西雅图/g,
  韩国: /春川|韩|首尔/g,
  Japan: /Tokyo|Osaka/g,
  英国: /伦敦/g,
  India: /Mumbai/g,
  Germany: /Frankfurt/g,
  Switzerland: /Zurich/g,
  俄罗斯: /莫斯科/g,
  土耳其: /伊斯坦布尔/g,
  泰国: /泰國|曼谷/g,
  法国: /巴黎/g,
  波斯尼亚和黑塞哥维那: /波黑共和国/g,
  印尼: /印度尼西亚|雅加达/g,
  印度: /孟买/g,
  孟加拉国: /孟加拉/g,
  捷克: /捷克共和国/g,
  阿联酋: /(阿联酋|迪拜|UAE|United\s*Arab\s*Emirates|Dubai)/gi,
  沙特阿拉伯: /(沙特|沙特阿拉伯|Saudi\s*Arabia|KSA|\bSTC\b)/gi,
  家宽: /家庭宽带|家庭|住宅/g,
  G: /\d\s?GB/gi,
  Esnc: /esnc/gi
};

// ---------- 主流程 ----------
function operator(proxies){
  const pro = Array.isArray(proxies) ? proxies.slice() : [];
  if (!pro.length) return pro;

  // 输出表
  const outList = getList(outputName);
  // 输入识别表（默认：ZH → QC → EN；in=flag 时识别国旗）
  const inputLists = inname ? [getList(inname)] : [ZH, QC, EN];

  // 构建映射（过滤空键/值）
  const allMap = {};
  inputLists.forEach(arr => {
    arr.forEach((v, idx) => {
      const key = String(v||"").trim();
      const val = String(outList[idx]||"").trim();
      if (key && val) allMap[key] = val;
    });
  });
  const AMK = Object.entries(allMap);

  // 关键字参数
  const BLKEYS = BLKEY ? BLKEY.split("+").filter(Boolean) : [];
  const WLKEYS = WLKEY ? WLKEY.split("+").filter(Boolean) : [];

  // —— 识别 & 重命名（不清理）——
  const handled = [];
  for (const e0 of pro){
    const e = {...e0};
    e.name  = String(e.name||"");
    const nameBefore = e.name;

    // 归一化替换
    for (const k in rurekey){
      const re = rurekey[k];
      if (re && re.test(e.name)) e.name = e.name.replace(re, k);
    }

    // “深/沪/呼/京/广/杭 + 港”硬锁香港
    if (/(深|沪|呼|京|广|杭)港/.test(nameBefore) || /(深|沪|呼|京|广|杭)港/.test(e.name)){
      e.name = e.name.replace(/(深|沪|呼|京|广|杭)港/gi, "香港");
    }

    // block-quic
    if (blockquic === "on") e["block-quic"] = "on";
    else if (blockquic === "off") e["block-quic"] = "off";
    else delete e["block-quic"];

    // 额外保留词（用于拼接）
    let retainKey = [];
    if (BLKEYS.length){
      for (const token of BLKEYS){
        if (!token) continue;
        if (token.includes(">")){
          const [src, rep=""] = token.split(">");
          if (src && nameBefore.includes(src)) retainKey.push(rep || src);
        }else if (nameBefore.includes(token)){
          retainKey.push(token);
        }
      }
    }

    // 倍率/标签
    let ikey = "", ikeys = "";
    if (blgd){
      for (let i=0;i<regexArray.length;i++){
        if (regexArray[i].test(e.name)){ikeys = valueArray[i]; break;}
      }
    }
    if (bl){
      const m = e.name.match(/((倍率|X|x|×)\D?((\d{1,3}\.)?\d+)\D?)|((\d{1,3}\.)?\d+)(倍|X|x|×)/);
      if (m){
        const rev = (m[0].match(/(\d[\d.]*)/)||[])[0];
        if (rev && rev !== "1") ikey = `${rev}×`;
      }
    }

    // 只按名字做地区匹配（无任何域名/端口兜底）
    const found = AMK.find(([k]) => matchWithBoundary(e.name, k));

    // 组名
    let prefix = nf ? FNAME : "";
    let nNames = nf ? "" : FNAME;

    if (found && found[1]){
      const outVal = found[1];
      let flag = "";
      if (addflag){
        const idx = getList(outputName).indexOf(outVal);
        if (idx !== -1) flag = FG[idx] || "";
      }
      const parts = [prefix, flag, nNames, outVal]
        .concat(retainKey)
        .concat(ikey ? [ikey] : [])
        .concat(ikeys ? [ikeys] : [])
        .filter(Boolean);
      e.name = parts.join(FGF);
      handled.push(e);
    }else{
      // 未识别：若 nm=true 则保留前缀 + 原名；否则跳过该节点
      if (nm){
        e.name = [FNAME, e.name].filter(Boolean).join(FGF);
        handled.push(e);
      }
    }
  }

  // 连号/去重/排序
  jxh(handled);
  if (numone) oneP(handled);
  if (blpx) handled.splice(0, handled.length, ...fampx(handled));

  // —— 最终清理（支持 wlkey 白名单）——
  if (clear || nx || blnx || key){
    const WL = WLKEYS.length ? new RegExp(WLKEYS.map(k=>escapeReg(k)).join("|"), "i") : null;
    const out = [];
    for (const res of handled){
      const nmStr = String(res.name||"");
      const white = WL ? WL.test(nmStr) : false;

      let keep = true;
      if (!white){
        if (clear && nameclear.test(nmStr)) keep = false;
        if (keep && nx && namenx.test(nmStr)) keep = false;
        if (keep && blnx && !nameblnx.test(nmStr)) keep = false;
        if (keep && key && !(keya.test(nmStr) && /2|4|6|7/i.test(nmStr))) keep = false;
      }
      if (keep) out.push(res);
    }
    if (key){
      for (let i=out.length-1;i>=0;i--){
        if (keyb.test(out[i].name)) out.splice(i,1);
      }
    }
    return out;
  }

  return handled;
}

// ---------- 辅助 ----------
function getList(arg){
  switch(arg){
    case "us": return EN;
    case "gq": return FG;
    case "quan": return QC;
    default: return ZH;
  }
}
function jxh(list){
  const groups = list.reduce((acc, item)=>{
    const base = String(item.name||"");
    const hit = acc.find(x=>x.name===base);
    if (hit){
      hit.count++;
      hit.items.push({...item, name: `${base}${XHFGF}${String(hit.count).padStart(2,"0")}`});
    }else{
      acc.push({name: base, count:1, items:[{...item, name: `${base}${XHFGF}01`}]});
    }
    return acc;
  }, []);
  const flat = ([]).concat(...groups.map(g=>g.items));
  list.splice(0, list.length, ...flat);
  return list;
}
function oneP(list){
  const buckets = list.reduce((m, it)=>{
    const key = String(it.name||"").replace(/[^A-Za-z0-9\u00C0-\u017F\u4E00-\\u9FFF]+\\d+$/,"");
    (m[key]||(m[key]=[])).push(it);
    return m;
  },{});
  for (const k in buckets){
    const arr = buckets[k];
    if (arr.length===1 && /01$/.test(arr[0].name)){
      arr[0].name = arr[0].name.replace(/01$/,"");
    }
  }
  return list;
}
function fampx(list){
  const withSp=[], noSp=[];
  for (const p of list){
    const has = specialRegex.some(re=>re.test(String(p.name||"")));
    (has?withSp:noSp).push(p);
  }
  const order = withSp.map(p=>specialRegex.findIndex(re=>re.test(String(p.name||""))));
  withSp.sort((a,b)=> order[withSp.indexOf(a)]-order[withSp.indexOf(b)] || String(a.name).localeCompare(String(b.name)));
  noSp.sort((a,b)=> list.indexOf(a)-list.indexOf(b));
  return noSp.concat(withSp);
}
