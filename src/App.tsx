import { useState, useEffect, useRef } from 'react';
import './App.css';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrent } from '@tauri-apps/api/window';
import { Button, Checkbox, FormControlLabel, Typography, Container, Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

interface ColimaProfile {
  name: string;
  status: string;
  arch: string;
  cpus: string;
  memory: string;
  disk: string;
  runtime?: string;
  address?: string;
}

function App() {
  const [output, setOutput] = useState<string[]>([]);
  const [debug, setDebug] = useState(false);
  const [profiles, setProfiles] = useState<ColimaProfile[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<string>('command-output', (event) => {
      console.log('Received event:', event.payload); // Debugging print
      setOutput((prevOutput) => [...prevOutput, event.payload]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  // Fetch profiles on mount and refresh every 5 seconds
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const result = await invoke<ColimaProfile[]>('list_profiles');
        setProfiles(result);
      } catch (error) {
        console.error('Failed to fetch profiles:', error);
      }
    };

    fetchProfiles();
    const interval = setInterval(fetchProfiles, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = async (command: string, label?: string) => {
    try {
      setOutput((prevOutput) => [...prevOutput, `$ ${label || command}`]); // Add command to output
      const currentWindow = await getCurrent();
      await invoke(command, { window: currentWindow, debug });
    } catch (error) {
      alert('Error: ' + error);
    }
  };

  const formatOutput = (line: string) => {
    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal')) {
      return <span style={{ color: 'red' }}>{line}</span>;
    } else if (line.toLowerCase().includes('warn')) {
      return <span style={{ color: 'yellow' }}>{line}</span>;
    }
    return <span>{line}</span>;
  };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        Colima GUI
      </Typography>

      {/* Profiles Table */}
      <Box mb={3}>
        <Typography variant="h6" gutterBottom>
          Colima Profiles
        </Typography>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Profile</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Arch</strong></TableCell>
                <TableCell><strong>CPUs</strong></TableCell>
                <TableCell><strong>Memory</strong></TableCell>
                <TableCell><strong>Disk</strong></TableCell>
                <TableCell><strong>Runtime</strong></TableCell>
                <TableCell><strong>Address</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">No profiles found</TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => (
                  <TableRow key={profile.name}>
                    <TableCell>{profile.name}</TableCell>
                    <TableCell>
                      <span style={{ color: profile.status === 'Running' ? 'green' : 'gray' }}>
                        {profile.status}
                      </span>
                    </TableCell>
                    <TableCell>{profile.arch}</TableCell>
                    <TableCell>{profile.cpus}</TableCell>
                    <TableCell>{profile.memory}</TableCell>
                    <TableCell>{profile.disk}</TableCell>
                    <TableCell>{profile.runtime || '-'}</TableCell>
                    <TableCell>{profile.address || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box display="flex" justifyContent="space-between">
        <Box display="flex" flexDirection="column" gap={2}>
          <Button variant="contained" onClick={() => handleClick('start_colima', 'colima start')}>Start</Button>
          <Button variant="contained" onClick={() => handleClick('stop_colima', 'colima stop')}>Stop</Button>
          <Button variant="contained" onClick={() => handleClick('restart_colima', 'colima restart')}>Restart</Button>
          <Button variant="contained" onClick={() => handleClick('status_colima', 'colima status')}>Check Status</Button>
          <Button variant="contained" onClick={() => handleClick('open_config', 'open ~/.colima/default/colima.yaml')}>Edit Config</Button>
          <Button variant="contained" onClick={() => handleClick('delete_colima', 'colima delete')}>Delete</Button>
          <Button variant="contained" onClick={() => handleClick('list_colima', 'colima list')}>List Instances</Button>
          <Button variant="contained" onClick={() => handleClick('prune_colima', 'colima prune -f')}>Prune Assets</Button>
          <Button variant="contained" onClick={() => handleClick('version_colima', 'colima version')}>Version</Button>
          <FormControlLabel
            control={
              <Checkbox
                checked={debug}
                onChange={(e) => setDebug(e.target.checked)}
              />
            }
            label="Debug Mode"
          />
        </Box>
        <Paper elevation={3} style={{ padding: '10px', backgroundColor: 'black', color: 'white', height: '400px', overflowY: 'auto', width: '100%' }} ref={terminalRef}>
          {output.map((line, index) => (
            <div key={index}>{formatOutput(line)}</div>
          ))}
        </Paper>
      </Box>
    </Container>
  );
}

export default App;
