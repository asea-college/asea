import 'dart:math';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'kindness.dart';
const url='https://zbpeyklwpotjyveipzxd.supabase.co';
const key='sb_publishable_DxtNEPtU2KktlcRQnQx9jA_szCPFzMj';
Future<void> main() async {
 WidgetsFlutterBinding.ensureInitialized();
 await Supabase.initialize(url:url, anonKey:key);
 runApp(MaterialApp(title:'아세아 이음',debugShowCheckedModeBanner:false,theme:ThemeData(colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xff184da4))),home:const SignIn()));
}
class SignIn extends StatefulWidget {const SignIn({super.key});@override State<SignIn> createState()=>_SignInState();}
class _SignInState extends State<SignIn>{
 final email=TextEditingController(),pw=TextEditingController();String error='';bool busy=false;
 @override void dispose(){email.dispose();pw.dispose();super.dispose();}
 Future<void> login() async {
  setState((){busy=true;error='';});
  try{
   final sb=Supabase.instance.client;
   final result=await sb.auth.signInWithPassword(email:email.text.trim(),password:pw.text);
   final user=result.user;if(user==null)throw Exception('인증에 실패했습니다.');
   final profile=await sb.from('notice_profiles').select('status,role').eq('id',user.id).maybeSingle();
   if(profile?['status']!='active'){await sb.auth.signOut();throw Exception('관리자 승인을 기다리고 있습니다.');}
   if(mounted)Navigator.pushReplacement(context,MaterialPageRoute(builder:(_)=>Rooms(isAdmin:profile?['role']=='super')));
  }on AuthException catch(e){if(mounted)setState(()=>error=e.statusCode=='400'?'로그인 정보를 확인하십시오. 계정 이메일이나 비밀번호가 일치하지 않습니다.':e.message);}
  catch(e){if(mounted)setState(()=>error='로그인 처리에 실패했습니다. 다시 시도하십시오.');}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> requestReset()async{
  final address=email.text.trim();
  if(!address.contains('@')){if(mounted)setState(()=>error='비밀번호를 재설정할 이메일 주소를 입력하십시오.');return;}
  setState((){busy=true;error='';});
  try{
   await Supabase.instance.client.auth.resetPasswordForEmail(address);
   if(mounted)setState(()=>error='비밀번호 재설정 이메일을 요청했습니다. 메일함과 스팸함을 확인하십시오. 연결된 재설정 페이지의 구성에 따라 추가 조치가 필요할 수 있습니다.');
  }on AuthException catch(e){if(mounted)setState(()=>error='재설정 요청 실패: '+e.message);}
  catch(e){if(mounted)setState(()=>error='이메일 재설정 요청에 실패했습니다.');}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xfff1f5fb),body:Center(child:SingleChildScrollView(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:400),child:Card(child:Padding(padding:const EdgeInsets.all(24),child:Column(mainAxisSize:MainAxisSize.min,children:[
 const Icon(Icons.flight_takeoff,size:46,color:Color(0xff184da4)),const Text('아세아 이음',style:TextStyle(fontSize:32,fontWeight:FontWeight.bold,color:Color(0xff184da4))),
 const Text('함께 이어가는 소통 · ASEA IEUM'),const SizedBox(height:30),
 TextField(controller:email,keyboardType:TextInputType.emailAddress,decoration:const InputDecoration(labelText:'이메일',border:OutlineInputBorder())),
 const SizedBox(height:12),TextField(controller:pw,obscureText:true,decoration:const InputDecoration(labelText:'비밀번호',border:OutlineInputBorder())),
 const SizedBox(height:16),FilledButton(onPressed:busy?null:login,child:Text(busy?'인증 중':'로그인')),
 TextButton(onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const Register())),child:const Text('처음 사용하시나요? 교직원 가입')),
 TextButton(onPressed:busy?null:requestReset,child:const Text('비밀번호 재설정 이메일 요청')),
 if(error.isNotEmpty)Text(error,style:const TextStyle(color:Colors.red)),
 const SizedBox(height:14),const Text('아이디 전용 가입은 인증 API 구현 전까지 이용할 수 없습니다.',style:TextStyle(fontSize:11,color:Colors.grey))
 ])))))));
}
class Register extends StatefulWidget {const Register({super.key});@override State<Register> createState()=>_RegisterState();}
class _RegisterState extends State<Register>{
 final name=TextEditingController(),email=TextEditingController(),pw=TextEditingController();
 List<Map<String,dynamic>> departments=[];String? chosen;String status='';bool busy=false;
 @override void initState(){super.initState();loadDepartments();}
 Future<void> loadDepartments()async {try {final data=await Supabase.instance.client.from('notice_departments').select('id,name').eq('active',true).order('name');if(mounted)setState((){departments=List<Map<String,dynamic>>.from(data);});}catch(e){if(mounted)setState(()=>status='부서 목록을 불러오지 못했습니다: '+e.toString());}}
 @override void dispose(){for(final c in [name,email,pw]){c.dispose();}super.dispose();}
 Future<void> signup()async{
  setState((){busy=true;status='';});
  try{
   if(name.text.trim().isEmpty||chosen==null)throw Exception('성명과 부서를 선택하십시오.');
   if(!email.text.contains('@')||pw.text.length<8)throw Exception('이메일과 8자 이상 비밀번호가 필요합니다.');
   await Supabase.instance.client.auth.signUp(email:email.text.trim(),password:pw.text,data:{
    'asea_notice_signup':'yes','full_name':name.text.trim(),'requested_department':departments.firstWhere((d)=>d['id']==chosen)['name']
   });
   if(mounted)setState(()=>status='가입 요청이 접수되었습니다. 이메일 확인이 필요한 경우 인증 후 관리자의 승인을 기다리십시오.');
  }catch(e){if(mounted)setState(()=>status=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('아세아 이음 · 회원가입')),body:SingleChildScrollView(child:Padding(padding:const EdgeInsets.all(22),child:Column(children:[
 TextField(controller:name,decoration:const InputDecoration(labelText:'성명')),
 DropdownButtonFormField<String>(initialValue:chosen,decoration:const InputDecoration(labelText:'소속 부서',border:OutlineInputBorder()),hint:const Text('부서를 선택하세요'),isExpanded:true,
 items:departments.map((d)=>DropdownMenuItem<String>(value:d['id'].toString(),child:Text(d['name'].toString()))).toList(),
 onChanged:(v)=>setState(()=>chosen=v)),
 if(departments.isEmpty)TextButton(onPressed:loadDepartments,child:const Text('부서 목록 새로고침')),
 TextField(controller:email,keyboardType:TextInputType.emailAddress,decoration:const InputDecoration(labelText:'이메일')),
 TextField(controller:pw,obscureText:true,decoration:const InputDecoration(labelText:'비밀번호 (8자 이상)')),
 const SizedBox(height:18),FilledButton(onPressed:busy?null:signup,child:Text(busy?'신청 중...':'가입 신청')),
 if(status.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:Text(status))
 ]))));
}

class DirectContactPage extends StatefulWidget {const DirectContactPage({super.key});@override State<DirectContactPage> createState()=>_DirectContactPageState();}
class _DirectContactPageState extends State<DirectContactPage>{
 List<Map<String,dynamic>> contacts=[];String query='',error='';
 @override void initState(){super.initState();load();}
 Future<void> load()async{try{final d=await Supabase.instance.client.rpc('notice_staff_directory');if(mounted)setState(()=>contacts=List<Map<String,dynamic>>.from(d as List));}catch(e){if(mounted)setState(()=>error=e.toString());}}
 Future<void> open(Map<String,dynamic> p)async{
 try{final id=await Supabase.instance.client.rpc('notice_open_direct',params:{'p_other':p['id']});
 final r=await Supabase.instance.client.from('notice_rooms').select('id,title,kind').eq('id',id).single();
 if(mounted)Navigator.push(context,MaterialPageRoute(builder:(_)=>Thread(room:Map<String,dynamic>.from(r))));
 }catch(e){if(mounted)setState(()=>error=e.toString());}
 }
 @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('동료에게 메시지 보내기')),
 body:Column(children:[Padding(padding:const EdgeInsets.all(12),child:TextField(onChanged:(v)=>setState(()=>query=v.trim()),decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'직원 이름 검색'))),
 if(error.isNotEmpty)Text(error,style:const TextStyle(color:Colors.red)),
 Expanded(child:ListView(children:contacts.where((p)=>p['id']!=Supabase.instance.client.auth.currentUser?.id&&p['full_name'].toString().contains(query)).map((p)=>ListTile(
 leading:const CircleAvatar(child:Icon(Icons.person)),title:Text(p['full_name'].toString()),trailing:const Icon(Icons.chat_bubble_outline),onTap:()=>open(p))).toList()))]));
}
class Rooms extends StatefulWidget {final bool isAdmin;const Rooms({super.key,this.isAdmin=false});@override State<Rooms> createState()=>_RoomsState();}
class _RoomsState extends State<Rooms>{
 List<Map<String,dynamic>> rooms=[];String status='';bool loading=true;
 @override void initState(){super.initState();refresh();}
 Future<void> refresh()async{
  try{final data=await Supabase.instance.client.from('notice_rooms').select('id,title,kind').order('created_at');
   if(mounted)setState((){rooms=List<Map<String,dynamic>>.from(data);status='';loading=false;});
  }catch(e){if(mounted)setState((){status=e.toString();loading=false;});}
 }
 @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('아세아 이음 · 메시지함'),actions:[IconButton(tooltip:'오늘의 작은 이음',onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const KindnessPage())),icon:const Icon(Icons.favorite_outline)),if(widget.isAdmin)TextButton.icon(onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const AdminConsole())),icon:const Icon(Icons.admin_panel_settings),label:const Text('관리자')),IconButton(onPressed:refresh,icon:const Icon(Icons.refresh)),IconButton(onPressed:()async{await Supabase.instance.client.auth.signOut();if(context.mounted)Navigator.pushReplacement(context,MaterialPageRoute(builder:(_)=>const SignIn()));},icon:const Icon(Icons.logout))]),
 body:loading?const Center(child:CircularProgressIndicator()):ListView(children:[
 ListTile(leading:const Icon(Icons.person_add_alt_1),title:const Text('동료 검색 · 개인 메시지 시작'),trailing:const Icon(Icons.chevron_right),onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const DirectContactPage()))),
 if(status.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:Text(status)),
 if(rooms.isEmpty)const Padding(padding:EdgeInsets.all(30),child:Text('참여할 대화방이 없습니다.')),
 ...rooms.map((r)=>ListTile(
 leading:CircleAvatar(child:Icon(r['kind']=='all'?Icons.campaign:r['kind']=='department'?Icons.groups:Icons.person)),
 title:Text(r['title'].toString()),subtitle:Text(r['kind']=='all'?'전체':r['kind']=='department'?'부서':'개인'),
 trailing:const Icon(Icons.chevron_right),
 onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>Thread(room:r)))))
 ]),
 bottomNavigationBar:NavigationBar(selectedIndex:1,onDestinationSelected:(index){if(index==1)return;if(index==0||index==2){Navigator.push(context,MaterialPageRoute(builder:(_)=>const Rooms()));}else{Navigator.push(context,MaterialPageRoute(builder:(_)=>const KindnessPage()));}},destinations:[
 NavigationDestination(icon:Icon(Icons.home_outlined),label:'홈'),
 NavigationDestination(icon:Icon(Icons.chat_bubble_outline),label:'메시지'),
 NavigationDestination(icon:Icon(Icons.campaign_outlined),label:'공지'),
 NavigationDestination(icon:Icon(Icons.settings_outlined),label:'설정')]));
}

class AdminConsole extends StatefulWidget {const AdminConsole({super.key});@override State<AdminConsole> createState()=>_AdminConsoleState();}
class _AdminConsoleState extends State<AdminConsole>{
 final sb=Supabase.instance.client;
 final channel=TextEditingController(),department=TextEditingController();
 List<Map<String,dynamic>> pending=[],departments=[],staff=[];
 String result='';bool loading=false;
 @override void initState(){super.initState();reload();}
 @override void dispose(){channel.dispose();department.dispose();super.dispose();}
 Future<void> reload()async{
  setState(()=>loading=true);
  try{
   final pendingRows=await sb.rpc('notice_pending_staff');
   final departmentRows=await sb.from('notice_departments').select('id,name').eq('active',true).order('name');
   final staffRows=await sb.rpc('notice_staff_directory');
   if(mounted)setState((){pending=List<Map<String,dynamic>>.from(pendingRows);departments=List<Map<String,dynamic>>.from(departmentRows);staff=List<Map<String,dynamic>>.from(staffRows);result='';});
  }catch(e){if(mounted)setState(()=>result=e.toString());}
  finally{if(mounted)setState(()=>loading=false);}
 }
 Future<void> approve(Map<String,dynamic> person)async{
  try{
   final name=(person['requested_department']??'').toString();
   String? dept;
   if(name.isNotEmpty){dept=(await sb.rpc('notice_resolve_department',params:{'p_name':name})).toString();}
   await sb.rpc('notice_approve_member',params:{'p_user':person['id'],'p_department':dept,'p_role':'staff'});
   await reload();
  }catch(e){if(mounted)setState(()=>result=e.toString());}
 }
 Future<void> addDepartment()async{
  if(department.text.trim().isEmpty)return;
  try{await sb.rpc('notice_resolve_department',params:{'p_name':department.text.trim()});department.clear();await reload();}
  catch(e){if(mounted)setState(()=>result=e.toString());}
 }
 Future<void> makeSuper(Map<String,dynamic> person)async{
 final choice=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:const Text('최고 관리자 지정'),content:Text(person['full_name'].toString()+' 계정에 전체 권한을 부여하시겠습니까?'),actions:[
 TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('취소')),
 FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('권한 부여'))]));
 if(choice!=true)return;
 try{await sb.rpc('notice_grant_super',params:{'p_user':person['id']});if(mounted)setState(()=>result='최고 관리자 권한을 부여했습니다.');}
 catch(e){if(mounted)setState(()=>result=e.toString());}
 }
 Future<void> addChannel()async{
  if(channel.text.trim().isEmpty)return;
  try{await sb.rpc('notice_create_channel',params:{'p_kind':'all','p_title':channel.text.trim()});channel.clear();if(mounted)setState(()=>result='전체 메시지 채널을 만들었습니다.');}
  catch(e){if(mounted)setState(()=>result=e.toString());}
 }
 @override Widget build(BuildContext context)=>Scaffold(
 appBar:AppBar(title:const Text('이음 관리자 센터'),actions:[IconButton(onPressed:reload,icon:const Icon(Icons.refresh))]),
 body:ListView(padding:const EdgeInsets.all(18),children:[
 const ListTile(leading:Icon(Icons.verified_user),title:Text('교직원 승인'),subtitle:Text('최고 관리자 계정에서만 접근할 수 있습니다.')),
 if(loading)const LinearProgressIndicator(),
 if(pending.isEmpty)const ListTile(title:Text('승인 대기 직원 없음')),
 ...pending.map((p)=>Card(child:ListTile(title:Text(p['full_name']?.toString()??'이름 없음'),subtitle:Text('신청 부서: '+(p['requested_department']?.toString()??'미지정')),trailing:FilledButton(onPressed:()=>approve(p),child:const Text('승인'))))),
 const Divider(),const ListTile(title:Text('최고 관리자 권한 부여'),subtitle:Text('승인된 직원만 지정 가능합니다. 권한 부여 전 계정을 확인하십시오.')),
 ...staff.where((p)=>p['id']!=sb.auth.currentUser?.id).map((p)=>ListTile(title:Text(p['full_name'].toString()),trailing:TextButton(onPressed:()=>makeSuper(p),child:const Text('관리자 지정')))),
 const Divider(),const ListTile(title:Text('공식 부서 목록'),subtitle:Text('가입자는 이 목록에서만 부서를 선택합니다.')),
 ...departments.map((d)=>ListTile(leading:const Icon(Icons.account_tree_outlined),title:Text(d['name'].toString()))),
 TextField(controller:department,decoration:const InputDecoration(labelText:'부서 추가',border:OutlineInputBorder())),
 FilledButton(onPressed:addDepartment,child:const Text('부서 등록')),
 const Divider(),TextField(controller:channel,decoration:const InputDecoration(labelText:'전체 메시지 채널명',border:OutlineInputBorder())),
 FilledButton(onPressed:addChannel,child:const Text('전체 채널 만들기')),
 if(result.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:Text(result,style:const TextStyle(color:Colors.red))),
 ]));
}

class Thread extends StatefulWidget {
 final Map<String,dynamic> room;const Thread({super.key,required this.room});
 @override State<Thread> createState()=>_ThreadState();
}
class _ThreadState extends State<Thread>{
 final input=TextEditingController();List<Map<String,dynamic>> messages=[];String status='';
 @override void initState(){super.initState();refresh();}
 @override void dispose(){input.dispose();super.dispose();}
 Future<void> refresh()async{
  try{final data=await Supabase.instance.client.from('notice_messages').select('body,sender_id,created_at').eq('room_id',widget.room['id']).order('created_at',ascending:false).limit(100);
  if(mounted)setState((){messages=List<Map<String,dynamic>>.from(data.reversed);status='';});
  }catch(e){if(mounted)setState(()=>status=e.toString());}
 }
 Future<void> send()async{
  final body=input.text.trim();if(body.isEmpty)return;
  try{
   final uid=Supabase.instance.client.auth.currentUser!.id;
   // Database requires UUID. Generate UUIDv4 from cryptographically secure Random.secure().
   final uuid=makeUuid();
   await Supabase.instance.client.from('notice_messages').insert({'room_id':widget.room['id'],'sender_id':uid,'body':body,'category':'general_message','client_nonce':uuid});
   input.clear();await refresh();
  }catch(e){if(mounted)setState(()=>status=e.toString());}
 }
 @override Widget build(BuildContext context){
 String prior='';
 final items=<Widget>[];
 for(final m in messages){
  final date=DateTime.tryParse(m['created_at'].toString())?.toLocal();
  final day=date==null?'':date.year.toString()+'.'+date.month.toString().padLeft(2,'0')+'.'+date.day.toString().padLeft(2,'0');
  if(day!=prior){items.add(Center(child:Padding(padding:const EdgeInsets.all(12),child:Chip(label:Text(day)))));prior=day;}
  final mine=m['sender_id']==Supabase.instance.client.auth.currentUser?.id;
  items.add(Align(alignment:mine?Alignment.centerRight:Alignment.centerLeft,child:Container(
   constraints:const BoxConstraints(maxWidth:300),margin:const EdgeInsets.symmetric(vertical:5,horizontal:12),
   padding:const EdgeInsets.all(12),decoration:BoxDecoration(color:mine?const Color(0xffdaebff):const Color(0xffedf1f8),borderRadius:BorderRadius.circular(14)),
   child:Text(m['body'].toString()))));
 }
 return Scaffold(appBar:AppBar(title:Text(widget.room['title'].toString()),actions:[IconButton(onPressed:refresh,icon:const Icon(Icons.refresh))]),
 body:Column(children:[if(status.isNotEmpty)Text(status,style:const TextStyle(color:Colors.red)),
 Expanded(child:RefreshIndicator(onRefresh:refresh,child:ListView(children:items.isEmpty?[const Padding(padding:EdgeInsets.all(40),child:Text('메시지 없음'))]:items))),
 SafeArea(child:Padding(padding:const EdgeInsets.all(10),child:Row(children:[Expanded(child:TextField(controller:input,decoration:const InputDecoration(hintText:'메시지 입력',border:OutlineInputBorder()))),IconButton(onPressed:send,icon:const Icon(Icons.send))])))
 ]));
}
}
String makeUuid(){
 final r=Random.secure();final b=List<int>.generate(16,(_)=>r.nextInt(256));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 String h(int n)=>n.toRadixString(16).padLeft(2,'0');
 final s=b.map(h).join();return s.substring(0,8)+'-'+s.substring(8,12)+'-'+s.substring(12,16)+'-'+s.substring(16,20)+'-'+s.substring(20);
}
