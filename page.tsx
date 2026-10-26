'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { COUNTRIES } from '../lib/countries';

type Product = { id:string; name:string; category:string; kind:string; selling_price_kobo:number; cost_price_kobo:number; stock_count:number; active:boolean; country_code:string|null; country_name:string|null; seller_id:string|null };
type CommissionRow = { country_code:string; country_name:string; flag_emoji:string; sales_count:number; gross_sales_kobo:number; commission_kobo:number; seller_payable_kobo:number };
const money = (kobo:number) => `₦${(Number(kobo||0)/100).toLocaleString('en-NG',{maximumFractionDigits:2})}`;

export default function AdminPage(){
 const [phone,setPhone]=useState(''); const [otp,setOtp]=useState(''); const [sent,setSent]=useState(false); const [session,setSession]=useState(false); const [role,setRole]=useState('customer');
 const [products,setProducts]=useState<Product[]>([]); const [msg,setMsg]=useState('');
 const [name,setName]=useState(''); const [slug,setSlug]=useState(''); const [category,setCategory]=useState('Virtual numbers'); const [kind,setKind]=useState('virtual_number'); const [price,setPrice]=useState(''); const [cost,setCost]=useState(''); const [desc,setDesc]=useState(''); const [productId,setProductId]=useState(''); const [lines,setLines]=useState('');
 const [countryCode,setCountryCode]=useState('US'); const [uploadCountry,setUploadCountry]=useState('US');
 const [commissionRows,setCommissionRows]=useState<CommissionRow[]>([]); const [rateCountry,setRateCountry]=useState('US'); const [ratePct,setRatePct]=useState('20');
 async function refresh(){
   const {data:auth}=await supabase.auth.getUser();
   if(!auth.user) return;
   const {data:profile}=await supabase.from('profiles').select('role').eq('id',auth.user.id).maybeSingle();
   const currentRole=profile?.role??'customer'; setRole(currentRole);
   let productQuery=supabase.from('products').select('id,name,category,kind,selling_price_kobo,cost_price_kobo,stock_count,active,country_code,country_name,seller_id');
   if(currentRole==='reseller') productQuery=productQuery.eq('seller_id',auth.user.id);
   const {data,error}=await productQuery.order('created_at',{ascending:false});
   if(error)setMsg(error.message); else setProducts((data??[]) as Product[]);
   if(currentRole==='admin') await loadCommission();
 }
 async function loadCommission(){
   const {data,error}=await supabase.rpc('admin_country_commission_summary');
   if(error){setMsg(`Commission report: ${error.message}`);return;}
   setCommissionRows((data??[]) as CommissionRow[]);
   const {data:rates}=await supabase.from('country_commission_rates').select('country_code,commission_rate_bps');
   const found=(rates??[]).find((r:any)=>r.country_code===rateCountry);
   if(found)setRatePct(String(Number(found.commission_rate_bps)/100));
 }
 useEffect(()=>{
   supabase.auth.getSession().then(({data})=>{setSession(!!data.session);if(data.session)void refresh()});
   const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(!!s);if(s)void refresh()});
   return()=>subscription.unsubscribe();
 },[]);
 async function sendOtp(){const {error}=await supabase.auth.signInWithOtp({phone});setMsg(error?.message??'OTP sent');if(!error)setSent(true)}
 async function verify(){const {error}=await supabase.auth.verifyOtp({phone,token:otp,type:'sms'});setMsg(error?.message??'Signed in');if(!error){setSession(true);await refresh()}}
 async function addProduct(){
   if(!['admin','reseller'].includes(role)){setMsg('Your account is not approved to list products. Ask an administrator to approve seller access.');return;}
   const {data:auth}=await supabase.auth.getUser();
   const country=COUNTRIES.find(c=>c.code===countryCode);
   const payload={name,slug:slug||name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),category,kind,description:desc,selling_price_kobo:Math.round(Number(price)*100),cost_price_kobo:Math.round(Number(cost||0)*100),delivery_mode:['data','airtime','bill'].includes(kind)?'provider':'stock',country_code:countryCode,country_name:country?.name??countryCode,seller_id:role==='reseller'?auth.user?.id:null,active:role==='admin'};
   const {error}=await supabase.from('products').insert(payload);
   setMsg(error?.message??'Product added');if(!error){setName('');setSlug('');await refresh()}
 }
 async function importStock(){
   const {data,error}=await supabase.functions.invoke('bulk-import',{body:{product_id:productId,lines,country_code:uploadCountry}});
   setMsg(error?.message??(data?.error??`Imported ${data?.imported??0} items for ${data?.country_name??uploadCountry}`));
   if(!error&&!data?.error){setLines('');await refresh()}
 }
 async function toggleProductActive(product:Product){
   const next=!product.active;
   const {error}=await supabase.from('products').update({active:next,updated_at:new Date().toISOString()}).eq('id',product.id);
   setMsg(error?.message??`${product.name} ${next?'approved and published':'paused'}`);if(!error)await refresh();
 }
 async function saveRate(){
   if(role!=='admin')return;
   const pct=Number(ratePct);
   if(!Number.isFinite(pct)||pct<0||pct>100){setMsg('Commission must be between 0% and 100%');return;}
   const {data:auth}=await supabase.auth.getUser();
   const {error}=await supabase.from('country_commission_rates').upsert({country_code:rateCountry,commission_rate_bps:Math.round(pct*100),updated_at:new Date().toISOString(),updated_by:auth.user?.id});
   setMsg(error?.message??`Commission for ${rateCountry} updated to ${pct}%`);if(!error)await loadCommission();
 }
 if(!session)return <main><h1><span className="brand">PlugNaija Global</span> Dashboard</h1><p>Sign in with the phone number authorized for your account.</p><section className="panel"><label>Phone number</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+2348012345678"/>{sent&&<><label>SMS code</label><input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="One-time code"/></>}<button onClick={sent?verify:sendOtp}>{sent?'Verify OTP':'Send OTP'}</button><p>{msg}</p></section></main>;
 const totalCommission=commissionRows.reduce((sum,r)=>sum+Number(r.commission_kobo||0),0);
 const totalGross=commissionRows.reduce((sum,r)=>sum+Number(r.gross_sales_kobo||0),0);
 const topCountries=[...commissionRows].filter(r=>Number(r.sales_count)>0).sort((a,b)=>Number(b.commission_kobo)-Number(a.commission_kobo)).slice(0,10);
 const selectedProduct=products.find(p=>p.id===productId);
 return <main>
  <header><h1><span className="brand">PlugNaija Global</span> {role==='admin'?'Admin Dashboard':role==='reseller'?'Seller Dashboard':'Marketplace Dashboard'}</h1><p>Country-aware listings, encrypted stock import and commission reporting</p><button className="secondary" onClick={async()=>{await supabase.auth.signOut();setSession(false)}}>Sign out</button></header>
  {role==='admin'&&<>
   <section className="grid"><div className="metric">Countries in catalog<strong>249</strong></div><div className="metric">Gross sales<strong>{money(totalGross)}</strong></div><div className="metric">Recorded platform commission<strong>{money(totalCommission)}</strong></div></section>
   <section className="panel"><h2>Commission by country</h2><p>Commission is calculated and recorded at purchase using the rate for the product country. This report is an accounting summary, not proof of payout or regulated escrow.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Country</th><th>Sales</th><th>Gross sales</th><th>Platform commission</th><th>Seller payable recorded</th></tr></thead><tbody>{topCountries.map(r=><tr key={r.country_code}><td>{r.flag_emoji} {r.country_name} ({r.country_code})</td><td>{r.sales_count}</td><td>{money(r.gross_sales_kobo)}</td><td>{money(r.commission_kobo)}</td><td>{money(r.seller_payable_kobo)}</td></tr>)}{topCountries.length===0&&<tr><td colSpan={5}>No country-tagged sales yet.</td></tr>}</tbody></table></div><h3>Set commission rate by country</h3><div className="cols"><div><label>Country</label><select value={rateCountry} onChange={e=>{setRateCountry(e.target.value);const found=commissionRows.find(r=>r.country_code===e.target.value);void supabase.from('country_commission_rates').select('commission_rate_bps').eq('country_code',e.target.value).maybeSingle().then(({data})=>{if(data)setRatePct(String(Number(data.commission_rate_bps)/100))})}}>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name} ({c.code})</option>)}</select></div><div><label>Commission percentage (0–100)</label><input type="number" min="0" max="100" step="0.5" value={ratePct} onChange={e=>setRatePct(e.target.value)}/></div></div><button onClick={saveRate}>Save country commission</button></section>
  </>}
  <div className="cols">
   <section className="panel"><h2>{role==='reseller'?'Add listing to your shop':'Add product'}</h2><p>{role==='reseller'?'Your listing will be attached to your approved seller account.':'Create a country-specific catalog product.'}</p><label>Product name</label><input value={name} onChange={e=>setName(e.target.value)}/><label>Slug (optional)</label><input value={slug} onChange={e=>setSlug(e.target.value)}/><label>Category</label><input value={category} onChange={e=>setCategory(e.target.value)}/><label>Product kind</label><select value={kind} onChange={e=>setKind(e.target.value)}>{['data','airtime','bill','voucher','virtual_number','licensed_subscription','digital_service'].map(k=><option key={k}>{k}</option>)}</select><label>Country</label><select value={countryCode} onChange={e=>setCountryCode(e.target.value)}>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name} ({c.code})</option>)}</select><label>Selling price (₦)</label><input type="number" value={price} onChange={e=>setPrice(e.target.value)}/>{role==='admin'&&<><label>Cost price (₦)</label><input type="number" value={cost} onChange={e=>setCost(e.target.value)}/></>}<label>Description</label><textarea value={desc} onChange={e=>setDesc(e.target.value)}/><button onClick={addProduct}>Add product</button></section>
   <section className="panel"><h2>Bulk stock upload</h2><p>Choose the country for this batch. Stock is encrypted before storage. Use one authorized virtual number, voucher, or transferable license per line.</p><label>Product</label><select value={productId} onChange={e=>{setProductId(e.target.value);const p=products.find(x=>x.id===e.target.value);if(p?.country_code)setUploadCountry(p.country_code)}}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.country_code?`${COUNTRIES.find(c=>c.code===p.country_code)?.flag??'🌍'} ${p.country_name??p.country_code} · `:''}{p.name} ({p.id.slice(0,8)})</option>)}</select><label>Stock country</label><select value={uploadCountry} onChange={e=>setUploadCountry(e.target.value)}>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.name} ({c.code})</option>)}</select>{selectedProduct?.country_code&&<p><small>Product country is fixed to {selectedProduct.country_name??selectedProduct.country_code}; stock must match.</small></p>}<label>Stock lines</label><textarea rows={10} value={lines} onChange={e=>setLines(e.target.value)} placeholder={'One authorized virtual number or license per line\nExample: +1XXXXXXXXXX (customer-registerable number)'}/><button onClick={importStock} disabled={!productId||!lines.trim()}>Encrypt and import stock</button><p><small>Bulk account credentials, password/recovery-code dumps and prohibited account transfers are not supported.</small></p></section>
  </div>
  <section className="panel"><h2>Product inventory</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>Country</th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th>{role==='admin'&&<th>Moderation</th>}</tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.country_code?`${COUNTRIES.find(c=>c.code===p.country_code)?.flag??'🌍'} ${p.country_name??p.country_code}`:'🌍 Global'}</td><td>{p.name}</td><td>{p.category}</td><td>{money(p.selling_price_kobo)}</td><td>{p.stock_count}</td><td>{p.active?'Active':'Inactive'} {p.stock_count<20?'· LOW':''}</td>{role==='admin'&&<td><button className="secondary" onClick={()=>toggleProductActive(p)}>{p.active?'Pause':'Approve / Publish'}</button></td>}</tr>)}</tbody></table></div></section>
  <p>{msg}</p><p><small>Seller role uses the existing reseller profile role and must be assigned by an administrator. Seller earnings shown in reports are recorded payables, not automated bank/PayPal/crypto payouts. Do not describe wallet balances as escrow.</small></p>
 </main>;
}
