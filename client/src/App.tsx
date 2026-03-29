import { Layout, Menu } from "antd";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import {
  BookOutlined,
  FormOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  NodeIndexOutlined,
  RobotOutlined,
  ReadOutlined,
  PieChartOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import KnowledgeInput from "./pages/KnowledgeInput";
import KnowledgeList from "./pages/KnowledgeList";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import TemplateManagement from "./pages/TemplateManagement";
import ProviderManagement from "./pages/ProviderManagement";
import AgentChat from "./pages/AgentChat";
import Review from "./pages/Review";
import TokenUsage from "./pages/TokenUsage";
import PromptManagement from "./pages/PromptManagement";

const { Header, Sider, Content } = Layout;

const menuItems = [
  {
    key: "/input",
    icon: <FormOutlined />,
    label: "知识输入",
  },
  {
    key: "/list",
    icon: <UnorderedListOutlined />,
    label: "知识列表",
  },
  {
    key: "/graph",
    icon: <NodeIndexOutlined />,
    label: "知识图谱",
  },
  {
    key: "/chat",
    icon: <RobotOutlined />,
    label: "AI 问答",
  },
  {
    key: "/review",
    icon: <ReadOutlined />,
    label: "复习",
  },
  {
    key: "/templates",
    icon: <AppstoreOutlined />,
    label: "模板管理",
  },
  {
    key: "/prompts",
    icon: <BulbOutlined />,
    label: "Prompt 管理",
  },
  {
    key: "/providers",
    icon: <SettingOutlined />,
    label: "模型配置",
  },
  {
    key: "/tokens",
    icon: <PieChartOutlined />,
    label: "Token 统计",
  },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          background: "#001529",
          padding: "0 24px",
        }}
      >
        <BookOutlined
          style={{ fontSize: 24, color: "#fff", marginRight: 12 }}
        />
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>
          个人知识库
        </span>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: "#fff" }}>
          <Menu
            mode="inline"
            selectedKeys={[
              location.pathname === "/" ? "/input" : location.pathname,
            ]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ height: "100%", borderRight: 0 }}
          />
        </Sider>
        <Layout style={{ padding: "24px" }}>
          <Content
            style={{
              background: "#fff",
              padding: 24,
              margin: 0,
              borderRadius: 8,
              minHeight: 280,
            }}
          >
            <Routes>
              <Route path="/" element={<KnowledgeInput />} />
              <Route path="/input" element={<KnowledgeInput />} />
              <Route path="/list" element={<KnowledgeList />} />
              <Route path="/graph" element={<KnowledgeGraph />} />
              <Route path="/chat" element={<AgentChat />} />
              <Route path="/review" element={<Review />} />
              <Route path="/templates" element={<TemplateManagement />} />
              <Route path="/prompts" element={<PromptManagement />} />
              <Route path="/providers" element={<ProviderManagement />} />
              <Route path="/tokens" element={<TokenUsage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
