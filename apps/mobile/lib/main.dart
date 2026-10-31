import 'dart:math';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'kindness.dart';
import 'community.dart';
const url='https://zbpeyklwpotjyveipzxd.supabase.co';
const key='sb_publishable_DxtNEPtU2KktlcRQnQx9jA_szCPFzMj';
Future<void> main() async {
 WidgetsFlutterBinding.ensureInitialized();
 await Supabase.initialize(url:url, anonKey:key);
 runApp(MaterialApp(title:'아세아 이음',debugShowCheckedModeBanner:false,theme:ThemeData(fontFamily:'Pretendard',colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xff184da4)),textTheme:const TextTheme(headlineMedium:TextStyle(fontFamily:'Pretendard',fontWeight:FontWeight.w700,letterSpacing:-0.6),titleLarge:TextStyle(fontFamily:'Pretendard',fontWeight:FontWeight.w700,letterSpacing:-0.4),bodyLarge:TextStyle(fontFamily:'Pretendard',fontWeight:FontWeight.w400,height:1.45),bodyMedium:TextStyle(fontFamily:'Pretendard',fontWeight:FontWeight.w400,height:1.4)),appBarTheme:const AppBarTheme(titleTextStyle:TextStyle(fontFamily:'Pretendard',fontSize:20,fontWeight:FontWeight.w700,color:Color(0xff193b74)))),home:const SignIn()));
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
class Rooms extends StatefulWidget {
 final bool isAdmin;
 const Rooms({super.key,this.isAdmin=false});
 @override State<Rooms> createState()=>_RoomsState();
}

class _RoomsState extends State<Rooms>{
 List<Map<String,dynamic>> rooms=[];
 String status='';
 bool loading=true;
 final scaffoldKey=GlobalKey<ScaffoldState>();

 @override void initState(){super.initState();refresh();}
 Future<void> refresh()async{
  try{
   final data=await Supabase.instance.client.from('notice_rooms').select('id,title,kind').order('created_at');
   if(mounted)setState((){rooms=List<Map<String,dynamic>>.from(data);status='';loading=false;});
  }catch(e){if(mounted)setState((){status=e.toString();loading=false;});}
 }

 void go(Widget page){
  if(scaffoldKey.currentState?.isDrawerOpen??false)Navigator.pop(context);
  Navigator.push(context,MaterialPageRoute(builder:(_)=>page));
 }

 Widget drawerEntry(IconData icon,String title,VoidCallback onTap,{String? caption}){
  return ListTile(
   contentPadding:const EdgeInsets.symmetric(horizontal:18,vertical:2),
   leading:Icon(icon,color:const Color(0xff2a5485),size:22),
   title:Text(title,style:const TextStyle(fontWeight:FontWeight.w600,fontSize:15)),
   subtitle:caption==null?null:Text(caption,style:const TextStyle(fontSize:11)),
   onTap:onTap,
   shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(12)));
 }

 Widget section(String title)=>Padding(
  padding:const EdgeInsets.fromLTRB(22,20,12,6),
  child:Text(title,style:const TextStyle(fontWeight:FontWeight.w700,fontSize:11,color:Color(0xff7889a0),letterSpacing:1)));

 Widget buildDrawer()=>Drawer(
  width:300,
  backgroundColor:const Color(0xfff9fbfe),
  child:SafeArea(child:Column(children:[
   Padding(padding:const EdgeInsets.fromLTRB(20,20,12,14),child:Row(children:[
    const CircleAvatar(radius:21,backgroundColor:Color(0xffe3edf9),child:Icon(Icons.hub_rounded,color:Color(0xff204b83))),
    const SizedBox(width:12),
    const Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Text('아세아 이음',style:TextStyle(fontSize:21,fontWeight:FontWeight.w700,letterSpacing:-.6,color:Color(0xff1b375a))),
     Text('함께 이어가는 소통',style:TextStyle(fontSize:11,color:Color(0xff70819b)))])),
    IconButton(tooltip:'메뉴 닫기',onPressed:()=>Navigator.pop(context),icon:const Icon(Icons.chevron_left))
   ])),
   const Divider(height:1),
   Expanded(child:ListView(padding:const EdgeInsets.symmetric(horizontal:10,vertical:10),children:[
    section('WORKSPACE'),
    drawerEntry(Icons.space_dashboard_outlined,'홈 대시보드',()=>go(const CommunityPage())),
    drawerEntry(Icons.forum_outlined,'전체·부서·개인 대화',()=>Navigator.pop(context)),
    drawerEntry(Icons.campaign_outlined,'공지 및 확인 응답',()=>go(const CommunityPage()),caption:'현재 공지 기능과 통합 진행 중'),
    drawerEntry(Icons.folder_copy_outlined,'부서·업무 인수인계',()=>go(const DirectContactPage()),caption:'관련 동료 및 대화 찾기'),
    section('COMMUNITY'),
    drawerEntry(Icons.how_to_vote_outlined,'투표 및 결과 집계',()=>go(const CommunityPage())),
    drawerEntry(Icons.event_available_outlined,'일정 조율',()=>go(const CommunityPage())),
    drawerEntry(Icons.volunteer_activism_outlined,'오늘의 마니또',()=>go(const KindnessPage())),
    drawerEntry(Icons.favorite_border,'익명 감사 우체통',()=>go(const KindnessPage())),
    drawerEntry(Icons.coffee_outlined,'랜덤 커피 메이트',()=>go(const KindnessPage()),caption:'공통 소통 화면'),
    drawerEntry(Icons.extension_outlined,'소통 놀이터',()=>go(const CommunityPage())),
    drawerEntry(Icons.radio_outlined,'이음 방송국',()=>go(const CommunityPage()),caption:'편성표 조회'),
    section('ACCOUNT'),
    if(widget.isAdmin)drawerEntry(Icons.admin_panel_settings_outlined,'최고 관리자 센터',()=>go(const AdminConsole())),
    drawerEntry(Icons.manage_accounts_outlined,'프로필·설정',()=>go(const IeumSettingsPage())),
   ])),
   const Divider(height:1),
   Padding(padding:const EdgeInsets.all(16),child:Row(children:[
    const Expanded(child:Text('ASEA IEUM · Beta',style:TextStyle(fontSize:12,color:Color(0xff7b889b)))),
    TextButton(onPressed:()async{
      Navigator.pop(context);
      await Supabase.instance.client.auth.signOut();
      if(mounted)Navigator.pushReplacement(context,MaterialPageRoute(builder:(_)=>const SignIn()));
    },child:const Text('로그아웃'))
   ]))
  ])));

 @override Widget build(BuildContext context)=>Scaffold(
  key:scaffoldKey,
  drawer:buildDrawer(),
  drawerEnableOpenDragGesture:true,
  drawerEdgeDragWidth:36,
  appBar:AppBar(
   leading:IconButton(tooltip:'전체 메뉴 열기',icon:const Icon(Icons.menu_rounded),
    onPressed:()=>scaffoldKey.currentState?.openDrawer()),
   title:const Text('아세아 이음'),
   actions:[
    IconButton(tooltip:'오늘의 작은 이음',onPressed:()=>go(const KindnessPage()),icon:const Icon(Icons.favorite_outline)),
    if(widget.isAdmin)IconButton(tooltip:'관리자',onPressed:()=>go(const AdminConsole()),icon:const Icon(Icons.admin_panel_settings_outlined)),
    IconButton(tooltip:'메시지 새로고침',onPressed:refresh,icon:const Icon(Icons.refresh)),
   ]),
  body:loading?const Center(child:CircularProgressIndicator()):ListView(padding:const EdgeInsets.fromLTRB(14,12,14,20),children:[
   Container(padding:const EdgeInsets.symmetric(horizontal:16,vertical:20),decoration:BoxDecoration(
    color:const Color(0xffedf4fd),borderRadius:BorderRadius.circular(18)),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     const Text('이음 대화',style:TextStyle(fontSize:23,fontWeight:FontWeight.w700,color:Color(0xff1c3d67))),
     const SizedBox(height:5),
     const Text('동료와 나누는 메시지와 업무의 흐름',style:TextStyle(color:Color(0xff6b8098))),
     const SizedBox(height:12),
     FilledButton.icon(onPressed:()=>go(const DirectContactPage()),
      icon:const Icon(Icons.add_comment_outlined),label:const Text('동료에게 새 메시지'))
    ])),
   if(status.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:Text(status)),
   if(rooms.isEmpty)const Padding(padding:EdgeInsets.all(30),
    child:Text('참여할 대화방이 없습니다. 관리자에게 부서 채널 개설을 요청하거나 동료에게 메시지를 보내십시오.')),
   ...rooms.map((r)=>Card(margin:const EdgeInsets.symmetric(vertical:5),child:ListTile(
    leading:CircleAvatar(backgroundColor:const Color(0xffe8eef7),
      child:Icon(r['kind']=='all'?Icons.campaign_outlined:r['kind']=='department'?Icons.groups_outlined:Icons.person_outline,color:const Color(0xff245a9c))),
    title:Text(r['title'].toString(),style:const TextStyle(fontWeight:FontWeight.w600)),
    subtitle:Text(r['kind']=='all'?'전체 교직원':r['kind']=='department'?'부서 대화':'개인 메시지'),
    trailing:const Icon(Icons.chevron_right),
    onTap:()=>go(Thread(room:r))))),
  ]),
  bottomNavigationBar:NavigationBar(selectedIndex:1,onDestinationSelected:(index){
   switch(index){
    case 0:go(const IeumSettingsPage());break;
    case 1:scaffoldKey.currentState?.openDrawer();break;
    case 2:go(const CommunityPage());break;
    case 3:go(const KindnessPage());break;
   }
  },destinations:const [
   NavigationDestination(icon:Icon(Icons.grid_view_rounded),label:'둘러보기'),
   NavigationDestination(icon:Icon(Icons.menu_open_rounded),label:'전체 메뉴'),
   NavigationDestination(icon:Icon(Icons.how_to_vote_outlined),label:'소통'),
   NavigationDestination(icon:Icon(Icons.favorite_outline),label:'마니또'),
  ])
 );
}

class IeumSettingsPage extends StatelessWidget{
 const IeumSettingsPage({super.key});
 @override Widget build(BuildContext context){
  final user=Supabase.instance.client.auth.currentUser;
  return Scaffold(appBar:AppBar(title:const Text('프로필·설정')),
   body:ListView(padding:const EdgeInsets.all(18),children:[
    Card(child:ListTile(leading:const Icon(Icons.account_circle_outlined),
     title:Text(user?.email??'로그인 계정'),subtitle:const Text('아세아 이음 · 계정 정보'))),
    const Card(child:ListTile(leading:Icon(Icons.swipe),
     title:Text('메뉴 여는 방법'),
     subtitle:Text('왼쪽 가장자리에서 오른쪽으로 밀거나 상단 메뉴 아이콘을 누르십시오. 열린 메뉴를 왼쪽으로 밀면 닫힙니다.'))),
    const Card(child:ListTile(leading:Icon(Icons.accessibility_new),
     title:Text('화면과 글꼴'),
     subtitle:Text('Pretendard 서체 및 반응형 화면을 적용합니다.'))),
    const Padding(padding:EdgeInsets.all(12),child:Text('알림 수신과 개인정보 설정은 향후 계정별 정책과 연결됩니다.',style:TextStyle(color:Colors.grey)))
   ]));
 }
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
 Future<void> transferStaff(Map<String,dynamic> person)async{
  String? toId;
  final approved=await showDialog<bool>(context:context,builder:(ctx)=>StatefulBuilder(builder:(ctx,update)=>AlertDialog(title:Text(person['full_name'].toString()+' 부서 이동'),
   content:DropdownButtonFormField<String>(hint:const Text('신규 부서 선택'),items:departments.map((d)=>DropdownMenuItem<String>(value:d['id'].toString(),child:Text(d['name'].toString()))).toList(),onChanged:(v)=>update(()=>toId=v)),
   actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('취소')),FilledButton(onPressed:toId==null?null:()=>Navigator.pop(ctx,true),child:const Text('이관'))])));
  if(approved!=true||toId==null)return;
  try{await sb.rpc('notice_transfer_staff',params:{'p_staff':person['id'],'p_to':toId});await reload();}
  catch(e){if(mounted)setState(()=>result=e.toString());}
 }
 Future<void> renameDept(Map<String,dynamic> dept)async{
  final input=TextEditingController(text:dept['name'].toString());
  final ok=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:const Text('부서명 변경'),content:TextField(controller:input),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('취소')),FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('변경'))]));
  if(ok!=true||input.text.trim().isEmpty)return;
  try{await sb.rpc('notice_rename_department',params:{'p_department':dept['id'],'p_name':input.text.trim()});await reload();}
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
 const Divider(),const ListTile(title:Text('직원 부서 이관'),subtitle:Text('이관해도 이전 업무 채팅은 보존됩니다.')),
 ...staff.map((p)=>ListTile(title:Text(p['full_name'].toString()),trailing:TextButton(onPressed:()=>transferStaff(p),child:const Text('부서 이동')))),
 const Divider(),const ListTile(title:Text('공식 부서 목록'),subtitle:Text('가입자는 이 목록에서만 부서를 선택합니다.')),
 ...departments.map((d)=>ListTile(leading:const Icon(Icons.account_tree_outlined),title:Text(d['name'].toString()),trailing:TextButton(onPressed:()=>renameDept(d),child:const Text('명칭 변경')))),
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
