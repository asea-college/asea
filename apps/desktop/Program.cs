using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ASEA.Notice {
  internal static class Program {
    [STAThread] static void Main() {
      ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
      Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
      Application.Run(new TrayApp());
    }
  }
  internal sealed class TrayApp: ApplicationContext {
    readonly NotifyIcon icon;
    readonly Timer tick;
    readonly HttpClient http=new HttpClient();
    readonly JavaScriptSerializer json=new JavaScriptSerializer();
    readonly string configPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ASEA","Notice","config.json");
    readonly HashSet<string> shown=new HashSet<string>();
    string server="https://zbpeyklwpotjyveipzxd.supabase.co",publishableKey="sb_publishable_DxtNEPtU2KktlcRQnQx9jA_szCPFzMj",accessToken="",userId="";
    bool checking;
    public TrayApp(){
      Directory.CreateDirectory(Path.GetDirectoryName(configPath));
      ReadConfig(); RegisterStartup();
      icon=new NotifyIcon{Icon=SystemIcons.Information,Text="아세아 이음",Visible=true};
      var menu=new ContextMenuStrip();
      menu.Items.Add("로그인 / 계정 전환",null,(s,e)=>Login());
      menu.Items.Add("공지 확인",null,async(s,e)=>await CheckNotices(true));
      menu.Items.Add("학교 일정표",null,(s,e)=>OpenCalendar());
      menu.Items.Add("로그아웃",null,(s,e)=>Logout());
      menu.Items.Add("관리자 서버 설정",null,async(s,e)=>await AdminSettings());
      menu.Items.Add("종료",null,(s,e)=>ExitThread());
      icon.ContextMenuStrip=menu;icon.DoubleClick+=(s,e)=>OpenCalendar();
      tick=new Timer{Interval=60000};tick.Tick+=async(s,e)=>await CheckNotices();tick.Start();
      Login();
    }
    void OpenCalendar(){System.Diagnostics.Process.Start("https://bangdw-hash.github.io/asea-calendar-management/schedule.html");}
    void ReadConfig(){try{if(File.Exists(configPath)){var c=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(configPath));c.TryGetValue("url",out server);c.TryGetValue("publishable_key",out publishableKey);}}catch{}}
    void SaveConfig(){var c=new Dictionary<string,string>{{"url",server},{"publishable_key",publishableKey}};File.WriteAllText(configPath,json.Serialize(c));}
    void RegisterStartup(){try{using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run",true)){if(key!=null)key.SetValue("ASEA Notice","\""+Application.ExecutablePath+"\"");}}catch{}}
    async Task<string> Call(string endpoint,HttpMethod method,string content=null){
      using(var req=new HttpRequestMessage(method,server.TrimEnd('/')+endpoint)){
        req.Headers.TryAddWithoutValidation("apikey",publishableKey);
        req.Headers.TryAddWithoutValidation("Authorization","Bearer "+(string.IsNullOrEmpty(accessToken)?publishableKey:accessToken));
        if(content!=null)req.Content=new StringContent(content,Encoding.UTF8,"application/json");
        using(var response=await http.SendAsync(req)){
          var body=await response.Content.ReadAsStringAsync();
          if(!response.IsSuccessStatusCode)throw new Exception("서버 HTTP "+(int)response.StatusCode);
          return body;
        }
      }
    }
    void Login(){
      using(var form=new Form{Text="아세아 이음 | 알림",ClientSize=new Size(440,450),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,BackColor=Color.FromArgb(243,247,253),Font=new Font("Malgun Gothic",9)}){
        var header=new Panel{Dock=DockStyle.Top,Height=100,BackColor=Color.FromArgb(33,72,156)};
        header.Controls.Add(new Label{Text="아세아 이음",ForeColor=Color.White,Font=new Font("Malgun Gothic",22,FontStyle.Bold),Location=new Point(23,15),AutoSize=true});
        header.Controls.Add(new Label{Text="교직원 통합 알림 · 안전한 계정 로그인",ForeColor=Color.White,Location=new Point(25,66),AutoSize=true});
        form.Controls.Add(header);
        var card=new Panel{Location=new Point(20,115),Size=new Size(400,315),BackColor=Color.White};
        form.Controls.Add(card);
        var title=new Label{Text="로그인",Location=new Point(22,18),Font=new Font("Malgun Gothic",13,FontStyle.Bold),AutoSize=true};card.Controls.Add(title);
        card.Controls.Add(new Label{Text="이메일 (Gmail 이외의 이메일도 가능)",Location=new Point(22,67),AutoSize=true});
        var email=new TextBox{Left=22,Top=92,Width=356};card.Controls.Add(email);
        card.Controls.Add(new Label{Text="비밀번호",Location=new Point(22,133),AutoSize=true});
        var pass=new TextBox{Left=22,Top=157,Width=356,UseSystemPasswordChar=true};card.Controls.Add(pass);
        var action=new Button{Text="로그인",Left=22,Top=205,Width=356,Height=40,BackColor=Color.FromArgb(33,72,156),ForeColor=Color.White,FlatStyle=FlatStyle.Flat};card.Controls.Add(action);
        var signup=new LinkLabel{Text="처음 사용하시나요? 직접 회원가입",Left=22,Top=264,Width=356,Height=27,TextAlign=ContentAlignment.MiddleCenter,LinkColor=Color.FromArgb(33,72,156)};card.Controls.Add(signup);
        signup.Click+=(sender,args)=>Signup();
        action.Click+=async(sender,args)=>{
          action.Enabled=false;action.Text="인증 확인 중...";
          try {
            if(string.IsNullOrWhiteSpace(email.Text)||string.IsNullOrEmpty(pass.Text))throw new Exception("이메일과 비밀번호를 입력하십시오.");
            var payload=json.Serialize(new Dictionary<string,string>{{"email",email.Text.Trim()},{"password",pass.Text}});
            var result=json.Deserialize<Dictionary<string,object>>(await Call("/auth/v1/token?grant_type=password",HttpMethod.Post,payload));
            accessToken=Convert.ToString(result["access_token"]);
            var user=(Dictionary<string,object>)result["user"];userId=Convert.ToString(user["id"]);
            var profile=await Call("/rest/v1/notice_profiles?select=status,role&id=eq."+Uri.EscapeDataString(userId),HttpMethod.Get);
            var rows=json.DeserializeObject(profile) as object[];
            if(rows==null||rows.Length==0)throw new Exception("교직원 가입 정보가 없습니다. 가입하기를 이용하십시오.");
            var row=rows[0] as Dictionary<string,object>;
            if(row==null||Convert.ToString(row["status"])!="active")throw new Exception("가입 신청이 접수되었으나 관리자 승인을 기다리고 있습니다.");
            SaveConfig();shown.Clear();form.Close();
            icon.BalloonTipTitle="아세아 이음 로그인 완료";icon.BalloonTipText="작업표시줄의 이음 아이콘에서 공지를 확인할 수 있습니다.";icon.ShowBalloonTip(3500);
            await CheckNotices();
          }catch(Exception ex){accessToken="";userId="";MessageBox.Show(ex.Message,"이음 로그인 안내",MessageBoxButtons.OK,MessageBoxIcon.Information);}
          finally{action.Enabled=true;action.Text="로그인";}
        };
        form.ShowDialog();
      }
    }
    void Signup(){
      using(var form=new Form{Text="아세아 이음 | 회원가입",ClientSize=new Size(435,490),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,BackColor=Color.White,Font=new Font("Malgun Gothic",9)}){
        form.Controls.Add(new Label{Text="아세아 이음 회원가입",Left=22,Top=16,AutoSize=true,Font=new Font("Malgun Gothic",15,FontStyle.Bold),ForeColor=Color.FromArgb(33,72,156)});
        var fields=new[] { "성명", "부서명", "이메일 (Gmail 이외의 이메일 가능)", "비밀번호", "비밀번호 확인" };
        var inputs=new TextBox[fields.Length];
        for(int i=0;i<fields.Length;i++){
          int y=68+i*68;
          form.Controls.Add(new Label{Text=fields[i],Left=23,Top=y,AutoSize=true});
          inputs[i]=new TextBox{Left=23,Top=y+22,Width=385,UseSystemPasswordChar=i>=3};
          form.Controls.Add(inputs[i]);
        }
        var submit=new Button{Text="회원가입 신청",Left=23,Top=421,Width=385,Height=42,BackColor=Color.FromArgb(33,72,156),ForeColor=Color.White,FlatStyle=FlatStyle.Flat};
        form.Controls.Add(submit);
        submit.Click+=async(sender,args)=>{
          submit.Enabled=false;submit.Text="가입 신청 중...";
          try{
            if(string.IsNullOrWhiteSpace(inputs[0].Text)||string.IsNullOrWhiteSpace(inputs[1].Text))throw new Exception("성명과 부서를 입력하십시오.");
            if(!inputs[2].Text.Contains("@")||inputs[3].Text.Length<8)throw new Exception("올바른 이메일과 8자 이상 비밀번호를 입력하십시오.");
            if(inputs[3].Text!=inputs[4].Text)throw new Exception("비밀번호가 일치하지 않습니다.");
            var payload=json.Serialize(new Dictionary<string,object>{
              {"email",inputs[2].Text.Trim()},{"password",inputs[3].Text},
              {"data",new Dictionary<string,string>{{"full_name",inputs[0].Text.Trim()},{"requested_department",inputs[1].Text.Trim()},{"asea_notice_signup","yes"}}}
            });
            await Call("/auth/v1/signup",HttpMethod.Post,payload);
            MessageBox.Show("가입 요청이 접수되었습니다. 이메일 확인 절차가 설정되어 있으면 인증을 완료하고, 관리자의 사용 승인을 기다리십시오.","아세아 이음 회원가입");
            form.Close();
          }catch(Exception ex){MessageBox.Show(ex.Message,"회원가입 실패",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
          finally{submit.Enabled=true;submit.Text="회원가입 신청";}
        };
        form.ShowDialog();
      }
    }
    async Task CheckNotices(bool notifyWhenEmpty=false){
      if(checking||string.IsNullOrEmpty(accessToken)||string.IsNullOrEmpty(userId))return;
      checking=true;
      try{
        var result=json.DeserializeObject(await Call("/rest/v1/notice_announcements?select=id,title,blocks,response_type&status=eq.published&order=created_at.desc&limit=50",HttpMethod.Get));
        var notices=result as object[];if(notices==null)return;if(notices.Length==0 && notifyWhenEmpty){MessageBox.Show("현재 확인 가능한 공지가 없습니다.","이음 공지");return;}
        foreach(var entry in notices){
          var n=entry as Dictionary<string,object>;if(n==null)continue;
          var id=Convert.ToString(n["id"]);if(shown.Contains(id))continue;
          shown.Add(id);
          await ConfirmNotice(n);
        }
      }catch(Exception ex){icon.BalloonTipTitle="이음 연결 상태";icon.BalloonTipText=ex.Message;icon.ShowBalloonTip(2000);}
      finally{checking=false;}
    }
    async Task ConfirmNotice(Dictionary<string,object> n){
      string id=Convert.ToString(n["id"]),title=Convert.ToString(n["title"]),rtype=Convert.ToString(n["response_type"]);
      using(var form=new Form{Text="이음 확인 필요 공지",Width=480,Height=335,StartPosition=FormStartPosition.CenterScreen,ControlBox=false,TopMost=true}){
        var panel=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(18),RowCount=4,ColumnCount=1};
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute,45));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute,65));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute,44));
        var heading=new Label{Text=title,Dock=DockStyle.Fill,Font=new Font("Malgun Gothic",12,FontStyle.Bold)};
        var description=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill};
        if(n.ContainsKey("blocks"))description.Text=json.Serialize(n["blocks"]);
        var input=new TextBox{Dock=DockStyle.Fill,Multiline=true,Visible=rtype=="comment"};
        var submit=new Button{Text="확인 및 전송",Dock=DockStyle.Fill};
        panel.Controls.Add(heading,0,0);panel.Controls.Add(description,0,1);panel.Controls.Add(input,0,2);panel.Controls.Add(submit,0,3);form.Controls.Add(panel);
        submit.Click+=async(s,e)=>{
          try{
            if(rtype=="comment"&&string.IsNullOrWhiteSpace(input.Text)){MessageBox.Show("의견을 입력하십시오.");return;}
            var payload=json.Serialize(new Dictionary<string,object>{
              {"notice_id",id},{"person_id",userId},{"answer",rtype=="comment"?"comment":"ack"},
              {"comment",rtype=="comment"?input.Text:null},{"client_request_id",Guid.NewGuid().ToString()}
            });
            await Call("/rest/v1/notice_responses",HttpMethod.Post,payload);
            form.DialogResult=DialogResult.OK;form.Close();
          }catch(Exception ex){MessageBox.Show(ex.Message+"\n서버 저장 실패로 창을 유지합니다.","전송 실패");}
        };
        form.ShowDialog();
      }
    }
    async Task AdminSettings(){
      if(string.IsNullOrEmpty(accessToken)||string.IsNullOrEmpty(userId)){MessageBox.Show("먼저 승인된 관리자 계정으로 로그인하십시오.");return;}
      try{
        var response=await Call("/rest/v1/notice_profiles?select=role,status&id=eq."+Uri.EscapeDataString(userId),HttpMethod.Get);
        var rows=json.DeserializeObject(response) as object[];
        if(rows==null||rows.Length==0){MessageBox.Show("관리자 권한이 없습니다.");return;}
        var row=rows[0] as Dictionary<string,object>;
        if(row==null||Convert.ToString(row["status"])!="active"||Convert.ToString(row["role"])!="super"){MessageBox.Show("최고 관리자만 서버 설정을 변경할 수 있습니다.");return;}
        using(var form=new Form{Text="아세아 이음 | 관리자 설정",ClientSize=new Size(480,235),StartPosition=FormStartPosition.CenterScreen,Font=new Font("Malgun Gothic",9)}){
          form.Controls.Add(new Label{Text="Supabase URL",Left=20,Top=17,AutoSize=true});
          var url=new TextBox{Left=20,Top=41,Width=434,Text=server};form.Controls.Add(url);
          form.Controls.Add(new Label{Text="공개용 Publishable Key",Left=20,Top=84,AutoSize=true});
          var key=new TextBox{Left=20,Top=108,Width=434,Text=publishableKey,UseSystemPasswordChar=true};form.Controls.Add(key);
          var save=new Button{Text="설정 저장",Left=20,Top=165,Width=434,Height=40};form.Controls.Add(save);
          save.Click+=(sender,args)=>{
            Uri uri;if(!Uri.TryCreate(url.Text.Trim(),UriKind.Absolute,out uri)||uri.Scheme!="https"||!uri.Host.EndsWith(".supabase.co",StringComparison.OrdinalIgnoreCase)){MessageBox.Show("Supabase 프로젝트 URL이 올바르지 않습니다.");return;}
            if(string.IsNullOrWhiteSpace(key.Text)||key.Text.StartsWith("sb_secret_",StringComparison.OrdinalIgnoreCase)){MessageBox.Show("공개용 Publishable Key만 허용합니다.");return;}
            server=url.Text.Trim();publishableKey=key.Text.Trim();SaveConfig();MessageBox.Show("서버 설정을 저장했습니다.");form.Close();
          };
          form.ShowDialog();
        }
      }catch(Exception ex){MessageBox.Show(ex.Message,"관리자 권한 확인 실패");}
    }
    void Logout(){accessToken="";userId="";shown.Clear();MessageBox.Show("로그아웃되었습니다. 다시 로그인하려면 트레이 아이콘을 선택하십시오.");}
    protected override void ExitThreadCore(){tick.Stop();icon.Visible=false;icon.Dispose();http.Dispose();base.ExitThreadCore();}
  }
}
