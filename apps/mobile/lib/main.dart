import 'dart:math';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
const url='https://zbpeyklwpotjyveipzxd.supabase.co';
const key='sb_publishable_DxtNEPtU2KktlcRQnQx9jA_szCPFzMj';
Future<void> main() async {
 WidgetsFlutterBinding.ensureInitialized();
 await Supabase.initialize(url:url, anonKey:key);
 runApp(MaterialApp(title:'ASEA',debugShowCheckedModeBanner:false,theme:ThemeData(colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xff184da4))),home:const SignIn()));
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
   final profile=await sb.from('notice_profiles').select('status').eq('id',user.id).maybeSingle();
   if(profile?['status']!='active'){await sb.auth.signOut();throw Exception('관리자 승인을 기다리고 있습니다.');}
   if(mounted)Navigator.pushReplacement(context,MaterialPageRoute(builder:(_)=>const Rooms()));
  }catch(e){if(mounted)setState(()=>error=e.toString());}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xfff1f5fb),body:Center(child:SingleChildScrollView(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:400),child:Card(child:Padding(padding:const EdgeInsets.all(24),child:Column(mainAxisSize:MainAxisSize.min,children:[
 const Icon(Icons.flight_takeoff,size:46,color:Color(0xff184da4)),const Text('ASEA',style:TextStyle(fontSize:32,fontWeight:FontWeight.bold,color:Color(0xff184da4))),
 const Text('교직원 통합 포털'),const SizedBox(height:30),
 TextField(controller:email,keyboardType:TextInputType.emailAddress,decoration:const InputDecoration(labelText:'이메일',border:OutlineInputBorder())),
 const SizedBox(height:12),TextField(controller:pw,obscureText:true,decoration:const InputDecoration(labelText:'비밀번호',border:OutlineInputBorder())),
 const SizedBox(height:16),FilledButton(onPressed:busy?null:login,child:Text(busy?'인증 중':'로그인')),
 if(error.isNotEmpty)Text(error,style:const TextStyle(color:Colors.red)),
 const SizedBox(height:14),const Text('아이디 전용 가입은 인증 API 구현 전까지 이용할 수 없습니다.',style:TextStyle(fontSize:11,color:Colors.grey))
 ])))))));
}
class Rooms extends StatefulWidget {const Rooms({super.key});@override State<Rooms> createState()=>_RoomsState();}
class _RoomsState extends State<Rooms>{
 List<Map<String,dynamic>> rooms=[];String status='';bool loading=true;
 @override void initState(){super.initState();refresh();}
 Future<void> refresh()async{
  try{final data=await Supabase.instance.client.from('notice_rooms').select('id,title,kind').order('created_at');
   if(mounted)setState((){rooms=List<Map<String,dynamic>>.from(data);status='';loading=false;});
  }catch(e){if(mounted)setState((){status=e.toString();loading=false;});}
 }
 @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('ASEA · 메시지함'),actions:[IconButton(onPressed:refresh,icon:const Icon(Icons.refresh)),IconButton(onPressed:()async{await Supabase.instance.client.auth.signOut();if(context.mounted)Navigator.pushReplacement(context,MaterialPageRoute(builder:(_)=>const SignIn()));},icon:const Icon(Icons.logout))]),
 body:loading?const Center(child:CircularProgressIndicator()):ListView(children:[
 if(status.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:Text(status)),
 if(rooms.isEmpty)const Padding(padding:EdgeInsets.all(30),child:Text('참여할 대화방이 없습니다.')),
 ...rooms.map((r)=>ListTile(
 leading:CircleAvatar(child:Icon(r['kind']=='all'?Icons.campaign:r['kind']=='department'?Icons.groups:Icons.person)),
 title:Text(r['title'].toString()),subtitle:Text(r['kind']=='all'?'전체':r['kind']=='department'?'부서':'개인'),
 trailing:const Icon(Icons.chevron_right),
 onTap:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>Thread(room:r)))))
 ]),
 bottomNavigationBar:const NavigationBar(selectedIndex:1,destinations:[
 NavigationDestination(icon:Icon(Icons.home_outlined),label:'홈'),
 NavigationDestination(icon:Icon(Icons.chat_bubble_outline),label:'메시지'),
 NavigationDestination(icon:Icon(Icons.campaign_outlined),label:'공지'),
 NavigationDestination(icon:Icon(Icons.settings_outlined),label:'설정')]));
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
String makeUuid(){
 final r=Random.secure();final b=List<int>.generate(16,(_)=>r.nextInt(256));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 String h(int n)=>n.toRadixString(16).padLeft(2,'0');
 final s=b.map(h).join();return s.substring(0,8)+'-'+s.substring(8,12)+'-'+s.substring(12,16)+'-'+s.substring(16,20)+'-'+s.substring(20);
}
